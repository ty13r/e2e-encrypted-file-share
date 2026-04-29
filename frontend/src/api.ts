const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type UploadResponse = { id: string };
export type FileResponse = {
  ciphertext: Uint8Array;
  iv_b64: string;
  size: number;
  created_at: string;
};

// Upload sends raw ciphertext bytes via multipart so we don't pay the
// ~33% base64 inflation or block the main thread on a multi-MB string.
export async function uploadFile(iv_b64: string, ciphertext: Uint8Array): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append("iv_b64", iv_b64);
  fd.append("ciphertext", new Blob([ciphertext], { type: "application/octet-stream" }), "ciphertext.bin");
  const res = await fetch(`${API_URL}/files`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Download returns raw bytes; metadata travels in custom headers so the
// recipient can stream the ciphertext into a Uint8Array without parsing JSON.
export async function fetchFile(id: string, signal?: AbortSignal): Promise<FileResponse> {
  const res = await fetch(`${API_URL}/files/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${await res.text()}`);
  const iv_b64 = res.headers.get("X-IV-B64");
  const size = Number(res.headers.get("X-File-Size") ?? "0");
  const created_at = res.headers.get("X-Created-At") ?? "";
  if (!iv_b64) throw new Error("server response missing X-IV-B64 header");
  const buf = await res.arrayBuffer();
  return { ciphertext: new Uint8Array(buf), iv_b64, size, created_at };
}
