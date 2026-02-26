/**
 * AES-256-GCM encryption for per-user Mapp credentials at rest.
 *
 * Uses the Web Crypto API (available in Node 20+ / Vercel Edge & Serverless).
 * The encryption key is derived from the CREDENTIAL_ENCRYPTION_KEY env var.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 128; // bits

function getKeyMaterial(): Uint8Array {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes / 256 bits)"
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function importKey(): Promise<CryptoKey> {
  const raw = getKeyMaterial();
  return crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt plaintext → base64 string containing IV + ciphertext + tag.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    encoded
  );

  // Concatenate IV + ciphertext (which includes the GCM auth tag)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return Buffer.from(combined).toString("base64");
}

/**
 * Decrypt a base64 string back to plaintext.
 */
export async function decrypt(encoded: string): Promise<string> {
  const key = await importKey();
  const combined = Buffer.from(encoded, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
