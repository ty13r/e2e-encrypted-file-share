import { useState } from "react";
import { Step, type StepStatus } from "./components/Step";
import { HexPreview } from "./components/HexPreview";
import {
  encrypt,
  exportKey,
  generateKey,
  packPlaintext,
  sha256Hex,
  toBase64,
  toBase64Url,
} from "./crypto";
import { uploadFile } from "./api";

type State = {
  file: File | null;
  plaintextHash: string | null;
  keyB64Url: string | null;
  iv: Uint8Array | null;
  ciphertext: Uint8Array | null;
  shareId: string | null;
  error: string | null;
  step: 0 | 1 | 2 | 3 | 4 | 5;
};

const INITIAL: State = {
  file: null,
  plaintextHash: null,
  keyB64Url: null,
  iv: null,
  ciphertext: null,
  shareId: null,
  error: null,
  step: 0,
};

function statusOf(current: number, target: number, error: boolean): StepStatus {
  if (error && current === target) return "error";
  if (current > target) return "done";
  if (current === target) return "active";
  return "pending";
}

export function SenderPage() {
  const [s, setS] = useState<State>(INITIAL);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setS({ ...INITIAL, file, step: 1 });
    try {
      const body = new Uint8Array(await file.arrayBuffer());
      const plaintextHash = await sha256Hex(body);
      setS((p) => ({ ...p, plaintextHash, step: 2 }));

      const key = await generateKey();
      const rawKey = await exportKey(key);
      const keyB64Url = toBase64Url(rawKey);
      setS((p) => ({ ...p, keyB64Url, step: 3 }));

      const packed = packPlaintext({ filename: file.name, mime: file.type || "application/octet-stream" }, body);
      const { iv, ciphertext } = await encrypt(key, packed);
      setS((p) => ({ ...p, iv, ciphertext, step: 4 }));

      const { id } = await uploadFile(toBase64(iv), toBase64(ciphertext));
      setS((p) => ({ ...p, shareId: id, step: 5 }));
    } catch (err) {
      setS((p) => ({ ...p, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  function reset() {
    setS(INITIAL);
  }

  const shareUrl =
    s.shareId && s.keyB64Url ? `${window.location.origin}/r/${s.shareId}#key=${s.keyB64Url}` : null;
  const err = !!s.error;

  return (
    <div>
      <h2>Send a file</h2>
      <p style={{ color: "#555", fontSize: 14 }}>
        Encryption happens here in the browser. The server only ever sees ciphertext.
      </p>

      <Step n={1} title="Pick a file" status={statusOf(s.step, 1, err)}>
        <input type="file" onChange={onFileChange} />
        {s.file && (
          <div style={{ marginTop: 6 }}>
            <code>{s.file.name}</code> · {s.file.size.toLocaleString()} bytes · {s.file.type || "—"}
            {s.plaintextHash && (
              <div style={{ marginTop: 4, fontSize: 11, color: "#666" }}>
                plaintext SHA-256: <code>{s.plaintextHash}</code>
              </div>
            )}
          </div>
        )}
      </Step>

      <Step n={2} title="Generate AES-GCM 256 key in browser" status={statusOf(s.step, 2, err)}>
        {s.keyB64Url && (
          <div>
            <div style={{ fontSize: 11, color: "#666" }}>raw key (base64url, never sent to server):</div>
            <code style={{ wordBreak: "break-all" }}>{s.keyB64Url}</code>
          </div>
        )}
      </Step>

      <Step n={3} title="Encrypt locally" status={statusOf(s.step, 3, err)}>
        {s.ciphertext && s.iv && (
          <>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
              IV (12 bytes, random per file): <code>{toBase64(s.iv)}</code>
            </div>
            <HexPreview bytes={s.ciphertext} label={`ciphertext (${s.ciphertext.length} bytes)`} />
          </>
        )}
      </Step>

      <Step n={4} title="Upload ciphertext to server" status={statusOf(s.step, 4, err)}>
        {s.shareId && (
          <>
            <div>file id: <code>{s.shareId}</code></div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              POST body sent: {`{ iv_b64, ciphertext_b64 }`} — no key, no filename in plaintext.
            </div>
          </>
        )}
      </Step>

      <Step n={5} title="Share link" status={statusOf(s.step, 5, err)}>
        {shareUrl && (
          <div>
            <div style={{ wordBreak: "break-all", padding: 8, background: "#f4f4f4", borderRadius: 4 }}>
              {shareUrl.split("#")[0]}
              <span style={{ background: "#ff0", padding: "0 2px" }}>#{shareUrl.split("#")[1]}</span>
            </div>
            <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>
              Everything after <code>#</code> is a URL fragment — browsers never send it to the server.
            </div>
            <button style={{ marginTop: 8 }} onClick={() => navigator.clipboard.writeText(shareUrl)}>
              Copy link
            </button>
            <button style={{ marginLeft: 8 }} onClick={reset}>Send another</button>
          </div>
        )}
      </Step>

      {s.error && <div style={{ color: "crimson", marginTop: 12 }}>Error: {s.error}</div>}
    </div>
  );
}
