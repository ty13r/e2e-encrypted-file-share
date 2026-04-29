// All crypto runs in the browser via WebCrypto. The server never sees keys or plaintext.

export type FileMeta = { filename: string; mime: string };

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

export async function importKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"],
  );
}

// Pack [4-byte BE header length][JSON meta][file bytes] into a single buffer
// so we can encrypt filename + content as one ciphertext.
export function packPlaintext(meta: FileMeta, body: Uint8Array): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify(meta));
  const out = new Uint8Array(4 + header.length + body.length);
  new DataView(out.buffer).setUint32(0, header.length, false);
  out.set(header, 4);
  out.set(body, 4 + header.length);
  return out;
}

export function unpackPlaintext(buf: Uint8Array): { meta: FileMeta; body: Uint8Array } {
  const headerLen = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, false);
  const headerBytes = buf.subarray(4, 4 + headerLen);
  const body = buf.subarray(4 + headerLen);
  const meta = JSON.parse(new TextDecoder().decode(headerBytes)) as FileMeta;
  return { meta, body };
}

export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv, ciphertext: new Uint8Array(ct) };
}

export async function decrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Uint8Array(pt);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Chunked binary-string builder so we never spread a multi-MB Uint8Array
// into String.fromCharCode (which would blow the call stack).
function bytesToBinaryString(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  return s;
}

// base64url helpers (no padding) — safe for URL fragments.
export function toBase64Url(bytes: Uint8Array): string {
  const s = btoa(bytesToBinaryString(bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Standard base64 (with padding) for transport to the server.
export function toBase64(bytes: Uint8Array): string {
  return btoa(bytesToBinaryString(bytes));
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}
