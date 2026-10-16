// Generates src/data/cables.json from TeleGeography's last open release of the Submarine Cable Map
// (repository telegeography/www.submarinecablemap.com, CC BY-NC-SA 3.0 Unported, files of 2022-08-05,
// commit 54055b5). The repository was deleted; the Internet Archive kept its zip. Run: `npm run data:cables`.
// The output is a derivative work and keeps the same license (see README).
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import type { LatLon } from '../src/sim/types';
import { isActive, km, simplify, splitLegs } from './lib/cables.ts';

const SOURCE =
  'https://web.archive.org/web/20220816215930id_/https://codeload.github.com/telegeography/www.submarinecablemap.com/zip/refs/heads/master';
const SHA256 = '6384fdb18e3f293b9d9768e2ec484e7573e434621bf313bba0e196ed092fbcee';
const ROOT = 'www.submarinecablemap.com-master/web/public/api/v3/';
/** The snapshot's own year: "planned" in the data means planned as of 2022. */
const SNAPSHOT_YEAR = 2022;
/** Cables still "planned" in 2022 with RFS up to this year are taken as in service (approved 2026-10-16). */
const PLANNED_UNTIL = 2026;
/** Douglas–Peucker tolerance: invisible on the globe, keeps the JSON small. */
const TOL_KM = 8;
const OUT = new URL('../src/data/cables.json', import.meta.url);

/** Minimal zip reader (central directory + deflate), enough for one GitHub archive. */
function readZip(buf: Buffer): Map<string, () => Buffer> {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const files = new Map<string, () => Buffer>();
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    files.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

interface GeoFeature<G> { properties: Record<string, unknown> & { id: string; name: string }; geometry: G }
interface CableInfo {
  id: string; name: string; length: string | null; owners: string | null;
  rfs_year: number | null; is_planned: boolean | null;
  landing_points: { id: string; name: string; country: string | null }[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const ll = ([lon, lat]: number[]): LatLon => [lat, lon];
const round = (p: LatLon): LatLon => [r2(p[0]), r2(p[1])];

console.log('downloading', SOURCE);
const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
const zipBuf = Buffer.from(await res.arrayBuffer());
const hash = createHash('sha256').update(zipBuf).digest('hex');
if (hash !== SHA256) throw new Error(`unexpected archive (sha256 ${hash}); refusing to build from unverified data`);

const zip = readZip(zipBuf);
const json = <T>(path: string): T => {
  const f = zip.get(ROOT + path);
  if (!f) throw new Error(`missing in archive: ${path}`);
  return JSON.parse(f().toString('utf8')) as T;
};

const landingGeo = json<{ features: GeoFeature<{ coordinates: number[] }>[] }>('landing-point/landing-point-geo.json');
const landingAt = new Map(landingGeo.features.map((f) => [f.properties.id, ll(f.geometry.coordinates)]));
const cableGeo = json<{ features: GeoFeature<{ coordinates: number[][][] }>[] }>('cable/cable-geo.json');
const linesById = new Map<string, LatLon[][]>();
for (const f of cableGeo.features)
  linesById.set(f.properties.id, [...(linesById.get(f.properties.id) ?? []), ...f.geometry.coordinates.map((l) => l.map(ll))]);

const landings: Record<string, { name: string; country: string | null; at: LatLon }> = {};
const cables = [];
let dropped = 0, skippedLandings = 0;
for (const [id, lines] of linesById) {
  const info = json<CableInfo>(`cable/${id}.json`);
  if (!isActive({ rfsYear: info.rfs_year, planned: !!info.is_planned }, SNAPSHOT_YEAR, PLANNED_UNTIL)) { dropped++; continue; }
  const lps = info.landing_points.filter((lp) => landingAt.has(lp.id));
  const { legs, skipped } = splitLegs(
    lines.map((l) => simplify(l, TOL_KM)),
    lps.map((lp) => ({ id: lp.id, at: landingAt.get(lp.id)! })),
  );
  skippedLandings += skipped.length;
  if (skipped.length) console.warn(`  ${id}: landing(s) not routed (off the drawn route or sharing a vertex): ${skipped.join(', ')}`);
  if (!legs.length) { dropped++; continue; }
  for (const lp of lps) landings[lp.id] ??= { name: lp.name, country: lp.country, at: round(landingAt.get(lp.id)!) };
  cables.push({
    id,
    name: info.name,
    rfs: info.rfs_year,
    /** Still planned in the 2022 snapshot: the cable card says so. */
    planned: !!info.is_planned,
    lengthKm: info.length ? Number(info.length.replace(/[^\d.]/g, '')) || null : null,
    owners: info.owners ?? '',
    landings: lps.map((lp) => lp.id),
    legs: legs.map((l) => ({ a: l.a, b: l.b, km: Math.round(l.points.slice(1).reduce((s, p, i) => s + km(l.points[i], p), 0)), points: simplify(l.points, TOL_KM).map(round) })),
  });
}
cables.sort((a, b) => a.id.localeCompare(b.id));

const out = {
  source: 'TeleGeography Submarine Cable Map, github.com/telegeography/www.submarinecablemap.com (archived 2022-08-16)',
  license: 'CC BY-NC-SA 3.0 Unported',
  snapshot: '2022-08-05',
  landings,
  cables,
};
const text = JSON.stringify(out);
writeFileSync(OUT, text);
console.log(
  `${cables.length} cables, ${Object.keys(landings).length} landings, ${cables.reduce((s, c) => s + c.legs.length, 0)} legs;`,
  `${dropped} cables dropped (planned or unroutable), ${skippedLandings} landings off-route; ${(text.length / 1024).toFixed(0)} KB`,
);
