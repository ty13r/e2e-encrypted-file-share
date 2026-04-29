import { useState } from "react";
import { Step } from "./components/Step";
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

type Busy = null | "hashing" | "keygen" | "encrypting" | "uploading";

type State = {
  file: File | null;
  plaintextHash: string | null;
  keyB64Url: string | null;
  iv: Uint8Array | null;
  ciphertext: Uint8Array | null;
  shareId: string | null;
  error: string | null;
  step: 0 | 1 | 2 | 3 | 4 | 5;
  busy: Busy;
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
  busy: null,
};

const BUSY_LABEL: Record<Exclude<Busy, null>, string> = {
  hashing: "hashing plaintext…",
  keygen: "generating key…",
  encrypting: "encrypting locally…",
  uploading: "uploading ciphertext…",
};

function statusOf(current: number, target: number, error: boolean) {
  if (error && current === target) return "error" as const;
  if (current > target) return "done" as const;
  if (current === target) return "active" as const;
  return "pending" as const;
}

export function SenderPage() {
  const [s, setS] = useState<State>(INITIAL);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setS({ ...INITIAL, file, step: 1, busy: "hashing" });
    // Yield a frame so React can paint the busy state before the heavy work blocks.
    await new Promise((r) => setTimeout(r, 0));
    try {
      const body = new Uint8Array(await file.arrayBuffer());
      const plaintextHash = await sha256Hex(body);
      setS((p) => ({ ...p, plaintextHash, step: 2, busy: "keygen" }));

      const key = await generateKey();
      const rawKey = await exportKey(key);
      const keyB64Url = toBase64Url(rawKey);
      setS((p) => ({ ...p, keyB64Url, step: 3, busy: "encrypting" }));
      await new Promise((r) => setTimeout(r, 0));

      const packed = packPlaintext(
        { filename: file.name, mime: file.type || "application/octet-stream" },
        body,
      );
      const { iv, ciphertext } = await encrypt(key, packed);
      setS((p) => ({ ...p, iv, ciphertext, step: 4, busy: "uploading" }));
      await new Promise((r) => setTimeout(r, 0));

      const { id } = await uploadFile(toBase64(iv), toBase64(ciphertext));
      setS((p) => ({ ...p, shareId: id, step: 5, busy: null }));
    } catch (err) {
      setS((p) => ({ ...p, error: err instanceof Error ? err.message : String(err), busy: null }));
    }
  }

  function reset() {
    setS(INITIAL);
  }

  const shareUrl =
    s.shareId && s.keyB64Url
      ? `${window.location.origin}/r/${s.shareId}#key=${s.keyB64Url}`
      : null;
  const err = !!s.error;

  return (
    <>
      <h2>Send a file</h2>
      <p className="subtitle">
        Encryption happens here in the browser. The server only ever sees ciphertext.
      </p>

      <Step n={1} title="Pick a file" status={statusOf(s.step, 1, err)}>
        <input type="file" onChange={onFileChange} disabled={!!s.busy} />
        {s.file && (
          <div className="row" style={{ marginTop: 8 }}>
            <code>{s.file.name}</code> · {s.file.size.toLocaleString()} bytes ·{" "}
            <code>{s.file.type || "—"}</code>
            {s.busy === "hashing" && (
              <div className="hint"><span className="spinner" />{BUSY_LABEL.hashing}</div>
            )}
            {s.plaintextHash && (
              <div className="hint">
                plaintext SHA-256: <code>{s.plaintextHash}</code>
              </div>
            )}
          </div>
        )}
      </Step>

      <Step n={2} title="Generate AES-GCM 256 key in browser" status={statusOf(s.step, 2, err)}>
        {s.busy === "keygen" && (
          <div className="hint"><span className="spinner" />{BUSY_LABEL.keygen}</div>
        )}
        {s.keyB64Url && (
          <>
            <div className="hint">raw key (base64url, never sent to server):</div>
            <code>{s.keyB64Url}</code>
          </>
        )}
      </Step>

      <Step n={3} title="Encrypt locally" status={statusOf(s.step, 3, err)}>
        {s.busy === "encrypting" && (
          <div className="hint"><span className="spinner" />{BUSY_LABEL.encrypting}</div>
        )}
        {s.ciphertext && s.iv && (
          <>
            <div className="hint">
              IV (12 bytes, random per file): <code>{toBase64(s.iv)}</code>
            </div>
            <HexPreview
              bytes={s.ciphertext}
              label={`ciphertext (${s.ciphertext.length.toLocaleString()} bytes)`}
            />
          </>
        )}
      </Step>

      <Step n={4} title="Upload ciphertext to server" status={statusOf(s.step, 4, err)}>
        {s.busy === "uploading" && (
          <div className="hint"><span className="spinner" />{BUSY_LABEL.uploading}</div>
        )}
        {s.shareId && (
          <>
            <div className="row">file id: <code>{s.shareId}</code></div>
            <div className="hint">
              POST body sent: {`{ iv_b64, ciphertext_b64 }`} — no key, no filename in plaintext.
            </div>
          </>
        )}
      </Step>

      <Step n={5} title="Share link" status={statusOf(s.step, 5, err)}>
        {shareUrl && (
          <>
            <div className="share-link">
              {shareUrl.split("#")[0]}
              <span className="frag">#{shareUrl.split("#")[1]}</span>
            </div>
            <div className="hint">
              Everything after <code>#</code> is a URL fragment — browsers never send it to the server.
            </div>
            <div className="button-row">
              <button onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy link</button>
              <button className="ghost" onClick={reset}>Send another</button>
            </div>
          </>
        )}
      </Step>

      {s.error && <div className="error-banner">Error: {s.error}</div>}
    </>
  );
}
