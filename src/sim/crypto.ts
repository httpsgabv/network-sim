// Real AES-256-GCM via WebCrypto. Key exchange (TLS/E2E) is only animated, not implemented.
export const IV_BYTES = 12;
export const TAG_BYTES = 16;

export function createSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Returns iv || ciphertext || tag, a single blob ready to packetize. */
export async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(IV_BYTES + cipher.length);
  out.set(iv);
  out.set(cipher, IV_BYTES);
  return out;
}

/** Throws if the blob was tampered with or the key is wrong (GCM tag mismatch). */
export async function open(key: CryptoKey, sealed: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const iv = sealed.subarray(0, IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, sealed.subarray(IV_BYTES));
  return new Uint8Array(plain);
}
