import { mulberry32 } from '../sim/prng';
import { transmit } from '../sim/pipeline';
import { useSim, type Kind, type Payload, type Transfer } from '../store';

/** SPEC premise 8: videos (and photos) up to 5 MB. */
export const MAX_BYTES = 5 * 1024 * 1024;
export const DEMO_TEXT = 'Olha o pôr do sol daqui de São Paulo!';

const toBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

function drawSunset(ctx: CanvasRenderingContext2D, w: number, h: number, sunY: number) {
  const s = w / 240;
  ctx.fillStyle = '#e9845a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f4a259'; ctx.fillRect(0, 40 * s, w, h);
  ctx.fillStyle = '#ffe3a3'; ctx.beginPath(); ctx.arc(160 * s, sunY * s, 28 * s, 0, Math.PI * 2); ctx.fill();
  const poly = (pts: number[], color: string) => {
    ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i] * s, pts[i + 1] * s);
    ctx.fill();
  };
  poly([0, 112, 40, 82, 78, 104, 120, 70, 168, 110, 210, 86, 240, 104, 240, 124, 0, 124], '#5b3a6e');
  poly([0, 120, 60, 100, 110, 118, 150, 104, 240, 122, 240, 130, 0, 130], '#2b2d5c');
  ctx.fillStyle = '#1f3b6e'; ctx.fillRect(0, 126 * s, w, h);
  ctx.fillStyle = '#ffe3a380';
  [[138, 134, 44], [146, 142, 28], [152, 150, 16]].forEach(([x, y, l]) => ctx.fillRect(x * s, y * s, l * s, 3 * s));
}

/** A real JPEG drawn on a canvas. Film grain keeps it photo-sized (~25 KB) instead of a 3 KB flat image. */
async function demoPhoto(): Promise<Payload> {
  const canvas = document.createElement('canvas');
  canvas.width = 480; canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  drawSunset(ctx, 480, 320, 88);
  const img = ctx.getImageData(0, 0, 480, 320), rand = mulberry32(42);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 18;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise<Blob>((r, reject) => canvas.toBlob((b) => (b ? r(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.82));
  return { kind: 'photo', name: 'por-do-sol.jpg', mime: 'image/jpeg', bytes: await toBytes(blob) };
}

/** A real 1.5 s WebM recorded from an animated canvas; falls back to the photo if recording is unsupported. */
async function demoVideo(): Promise<Payload> {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported('video/webm')) return demoPhoto();
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 214;
  const ctx = canvas.getContext('2d')!;
  const recorder = new MediaRecorder(canvas.captureStream(24), { mimeType: 'video/webm', videoBitsPerSecond: 250_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<void>((r) => { recorder.onstop = () => r(); });
  const start = performance.now();
  const draw = () => drawSunset(ctx, 320, 214, 70 + ((performance.now() - start) / 1500) * 40);
  draw();
  // a timer, not rAF: rAF pauses in background tabs and the recording would come out empty
  const timer = setInterval(draw, 1000 / 24);
  recorder.start(250);
  await new Promise((r) => setTimeout(r, 1500));
  recorder.stop();
  await done;
  clearInterval(timer);
  const bytes = await toBytes(new Blob(chunks, { type: 'video/webm' }));
  // a few hundred bytes means no frames were captured (e.g. a fully throttled tab)
  if (bytes.length < 2048) return demoPhoto();
  return { kind: 'video', name: 'por-do-sol.webm', mime: 'video/webm', bytes };
}

export function textPayload(text: string): Payload {
  return { kind: 'text', name: 'mensagem', mime: 'text/plain;charset=utf-8', bytes: new TextEncoder().encode(text) };
}

export function demoPayload(kind: Kind): Promise<Payload> {
  if (kind === 'text') return Promise.resolve(textPayload(DEMO_TEXT));
  return kind === 'photo' ? demoPhoto() : demoVideo();
}

/** Validates an uploaded file at the trust boundary: type and size. */
export async function filePayload(file: File): Promise<Payload> {
  const kind: Kind | null = file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : null;
  if (!kind) throw new Error('Envie uma imagem ou um vídeo.');
  if (file.size > MAX_BYTES) throw new Error(`Arquivo de ${(file.size / 1048576).toFixed(1)} MB: o limite é 5 MB.`);
  return { kind, name: file.name, mime: file.type, bytes: await toBytes(file) };
}

let latest = 0;

/** Encrypts and packetizes for real, then hands the result to the animation. Stale sends are dropped. */
export async function send(payload: Payload): Promise<void> {
  const ticket = ++latest;
  const tx = await transmit(payload.bytes, useSim.getState().mtu);
  if (ticket !== latest) return;
  const media = payload.kind !== 'text';
  const url = (bytes: Uint8Array<ArrayBuffer>) => (media ? URL.createObjectURL(new Blob([bytes], { type: payload.mime })) : undefined);
  const previewUrl = url(payload.bytes);
  const posterUrl = payload.kind === 'photo' ? previewUrl : payload.kind === 'video' && previewUrl ? await videoPoster(previewUrl) : undefined;
  if (ticket !== latest) return;
  const transfer: Transfer = { ...tx, payload, previewUrl, deliveredUrl: url(tx.delivered), posterUrl };
  const previous = useSim.getState().transfer;
  useSim.getState().load(transfer);
  new Set([previous?.previewUrl, previous?.deliveredUrl, previous?.posterUrl]).forEach((u) => u && URL.revokeObjectURL(u));
}

/** First frame of a video as a JPEG object URL; undefined if the browser can't decode it in time. */
async function videoPoster(src: string): Promise<string | undefined> {
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.src = src;
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => { video.currentTime = Math.min(0.1, video.duration || 0); };
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('video decode failed'));
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
    return blob ? URL.createObjectURL(blob) : undefined;
  } catch {
    return undefined;
  }
}

export const sendDemo = async (kind: Kind) => send(await demoPayload(kind));

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
