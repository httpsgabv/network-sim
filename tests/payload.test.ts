import { describe, expect, it } from 'vitest';
import { MAX_BYTES, demoText, filePayload, formatBytes, textPayload } from '../src/lib/payload';

describe('filePayload (upload trust boundary)', () => {
  it('accepts images and videos, keeping the bytes', async () => {
    const img = await filePayload(new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }));
    expect(img).toMatchObject({ kind: 'photo', name: 'a.png', mime: 'image/png' });
    expect([...img.bytes]).toEqual([1, 2, 3]);
    expect((await filePayload(new File([new Uint8Array(4)], 'b.mp4', { type: 'video/mp4' }))).kind).toBe('video');
  });

  it('rejects other file types', async () => {
    await expect(filePayload(new File(['x'], 'doc.pdf', { type: 'application/pdf' }))).rejects.toThrow('imagem ou um vídeo');
  });

  it('rejects files over 5 MB', async () => {
    const big = new File([new Uint8Array(MAX_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' });
    await expect(filePayload(big)).rejects.toThrow('5 MB');
  });
});

describe('textPayload / formatBytes', () => {
  it('encodes text as UTF-8', () => {
    expect(textPayload('pôr').bytes).toHaveLength(4);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(23_284)).toBe('22.7 KB');
    expect(formatBytes(3 * 1048576)).toBe('3.0 MB');
  });
});

describe('demoText', () => {
  it('names the origin city', () => {
    expect(demoText('Londres')).toBe('Olha o pôr do sol daqui de Londres!');
  });
});
