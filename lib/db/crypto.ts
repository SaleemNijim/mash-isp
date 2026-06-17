/**
 * Temporary-password encryption — in-memory ONLY.
 *
 * Algorithm: PBKDF2 (SHA-256, 100 000 iterations) → AES-GCM 256-bit key.
 * Keys are NEVER written to localStorage, sessionStorage, Dexie, or any
 * persistent store. The in-memory map is automatically GC'd on page unload.
 *
 * Wire format (base64-encoded):
 *   [ salt: 16B ][ iv: 12B ][ AES-GCM ciphertext ]
 */

// ────────────────────────────────────────────────────────────────────────────
// In-memory passphrase registry — session-scoped, never persisted
// ────────────────────────────────────────────────────────────────────────────

const _sessionPassphrases = new Map<string, string>()

// ────────────────────────────────────────────────────────────────────────────
// Internal key derivation (not exported — no raw key material leaves module)
// ────────────────────────────────────────────────────────────────────────────

async function _deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts `plaintext` with `passphrase`.
 * Returns a base64 token that embeds a random salt and IV.
 * Safe to store temporarily (e.g. in React state) — NOT safe to persist.
 */
export async function encryptTempPassword(
  plaintext: string,
  passphrase: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const key  = await _deriveKey(passphrase, salt)
  const enc  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const buf = new Uint8Array(28 + enc.byteLength)
  buf.set(salt, 0)
  buf.set(iv, 16)
  buf.set(new Uint8Array(enc), 28)
  return btoa(String.fromCharCode(...buf))
}

/**
 * Decrypts a token produced by `encryptTempPassword`.
 * Throws if the passphrase is wrong or the token is corrupted.
 */
export async function decryptTempPassword(
  token: string,
  passphrase: string,
): Promise<string> {
  const buf  = Uint8Array.from(atob(token), c => c.charCodeAt(0))
  const salt = buf.slice(0, 16)
  const iv   = buf.slice(16, 28)
  const enc  = buf.slice(28)
  const key  = await _deriveKey(passphrase, salt)
  const dec  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, enc)
  return new TextDecoder().decode(dec)
}

/**
 * Registers a passphrase under an arbitrary `ref` key for reuse within the
 * current browser session.  Never call with a persisted `ref` value.
 */
export function storeSessionPassphrase(ref: string, passphrase: string): void {
  _sessionPassphrases.set(ref, passphrase)
}

/** Retrieves a registered passphrase. Returns `undefined` if not found. */
export function getSessionPassphrase(ref: string): string | undefined {
  return _sessionPassphrases.get(ref)
}

/** Removes a single passphrase from the in-memory registry. */
export function revokeSessionPassphrase(ref: string): void {
  _sessionPassphrases.delete(ref)
}

/** Wipes the entire in-memory registry (call on sign-out). */
export function revokeAllSessionPassphrases(): void {
  _sessionPassphrases.clear()
}
