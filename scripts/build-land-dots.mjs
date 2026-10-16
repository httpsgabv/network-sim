// Generates src/data/landDots.json: an equal-area grid of [lat, lon] points that fall on land.
// Source: world-atlas (Natural Earth, public domain). Run with `npm run data:land`.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);

const STEP = 1.6; // degrees between dots along a meridian
const LAT_MIN = -56; // skip Antarctica: it dominates the bottom of the globe and adds nothing to the story
const LAT_MAX = 84;

// Ray casting on [lon, lat] rings; fine at this resolution because Natural Earth cuts polygons at ±180.
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const polygons = land.features.flatMap((f) =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
);
const boxes = polygons.map((rings) => {
  const xs = rings[0].map((p) => p[0]), ys = rings[0].map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
});

const onLand = (lon, lat) =>
  polygons.some((rings, k) => {
    const [x0, y0, x1, y1] = boxes[k];
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) return false;
    return inRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lon, lat, hole));
  });

const dots = [];
for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP) {
  const lonStep = STEP / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  // offset alternate rows so the grid reads as a dot screen, not as stripes
  const offset = (Math.round((lat - LAT_MIN) / STEP) % 2) * lonStep * 0.5;
  for (let lon = -180 + offset; lon < 180; lon += lonStep) {
    if (onLand(lon, lat)) dots.push(+lat.toFixed(2), +lon.toFixed(2));
  }
}

writeFileSync(new URL('../src/data/landDots.json', import.meta.url), JSON.stringify(dots));
console.log(`${dots.length / 2} land dots`);
