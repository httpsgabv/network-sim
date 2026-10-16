import { describe, expect, it } from 'vitest';
import { IV_BYTES, TAG_BYTES, createSessionKey, open, seal } from '../src/sim/crypto';

const text = (s: string) => new TextEncoder().encode(s);

describe('crypto (AES-256-GCM)', () => {
  it('seal → open returns the original bytes', async () => {
    const key = await createSessionKey();
    const plain = text('Olha o pôr do sol daqui de São Paulo!');
    expect(await open(key, await seal(key, plain))).toEqual(plain);
  });

  it('sealed blob is iv + ciphertext + tag and does not contain the plaintext', async () => {
    const key = await createSessionKey();
    const plain = text('segredo segredo segredo');
    const sealed = await seal(key, plain);
    expect(sealed.length).toBe(IV_BYTES + plain.length + TAG_BYTES);
    expect(new TextDecoder().decode(sealed)).not.toContain('segredo');
  });

  it('uses a fresh iv per message', async () => {
    const key = await createSessionKey();
    const a = await seal(key, text('x'));
    const b = await seal(key, text('x'));
    expect(a.subarray(0, IV_BYTES)).not.toEqual(b.subarray(0, IV_BYTES));
  });

  it('rejects a tampered blob (GCM tag check)', async () => {
    const key = await createSessionKey();
    const sealed = await seal(key, text('integridade'));
    sealed[IV_BYTES] ^= 1;
    await expect(open(key, sealed)).rejects.toThrow();
  });

  it('rejects the wrong key', async () => {
    const sealed = await seal(await createSessionKey(), text('x'));
    await expect(open(await createSessionKey(), sealed)).rejects.toThrow();
  });
});
