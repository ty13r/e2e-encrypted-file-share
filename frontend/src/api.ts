const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type UploadResponse = { id: string };
export type FileResponse = {
  id: string;
  iv_b64: string;
  ciphertext_b64: string;
  size: number;
  created_at: string;
};

export async function uploadFile(iv_b64: string, ciphertext_b64: string): Promise<UploadResponse> {
  const res = await fetch(`${API_URL}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ iv_b64, ciphertext_b64 }),
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function fetchFile(id: string): Promise<FileResponse> {
  const res = await fetch(`${API_URL}/files/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}
