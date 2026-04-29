import { useEffect, useState } from "react";
import { Step, type StepStatus } from "./components/Step";
import { HexPreview } from "./components/HexPreview";
import {
  decrypt,
  fromBase64,
  fromBase64Url,
  importKey,
  sha256Hex,
  unpackPlaintext,
} from "./crypto";
import { fetchFile } from "./api";

const TEXT_PREVIEW_CAP = 64 * 1024;

type State = {
  id: string | null;
  secretInput: string;
  serverCiphertext: Uint8Array | null;
  iv: Uint8Array | null;
  plaintext: Uint8Array | null;
  filename: string | null;
  mime: string | null;
  plaintextHash: string | null;
  error: string | null;
  step: 0 | 1 | 2 | 3 | 4;
  busy: null | "fetching" | "decrypting";
};

const INITIAL: State = {
  id: null,
  secretInput: "",
  serverCiphertext: null,
  iv: null,
  plaintext: null,
  filename: null,
  mime: null,
  plaintextHash: null,
  error: null,
  step: 0,
  busy: null,
};

function statusOf(current: number, target: number, error: boolean): StepStatus {
  if (error && current === target) return "error";
  if (current > target) return "done";
  if (current === target) return "active";
  return "pending";
}

function parseUrl(): { id: string | null; key: string | null } {
  const m = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)$/);
  const id = m?.[1] ?? null;
  const hash = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hash);
  return { id, key: params.get("key") };
}

export function RecipientPage() {
  const [s, setS] = useState<State>(INITIAL);

  useEffect(() => {
    void fetchOnly();
    const onChange = () => void fetchOnly();
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 1+2: parse URL and fetch ciphertext, but don't decrypt.
  // The user clicks "Decrypt" themselves so the secret-entry interaction is explicit.
  async function fetchOnly() {
    const { id, key } = parseUrl();
    setS({ ...INITIAL, secretInput: key ?? "", id });

    if (!id) {
      setS((p) => ({ ...p, error: "missing file id in URL (expected /r/<id>)" }));
      return;
    }
    setS((p) => ({ ...p, step: 2, busy: "fetching" }));

    try {
      let file;
      try {
        file = await fetchFile(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(msg.includes("404") ? "file not found (link may be wrong or expired)" : msg);
      }
      const serverCiphertext = fromBase64(file.ciphertext_b64);
      const iv = fromBase64(file.iv_b64);
      setS((p) => ({ ...p, serverCiphertext, iv, step: 3, busy: null }));
    } catch (err) {
      setS((p) => ({ ...p, error: err instanceof Error ? err.message : String(err), busy: null }));
    }
  }

  async function decryptNow() {
    if (!s.serverCiphertext || !s.iv) return;
    const secret = s.secretInput.trim();
    if (!secret) {
      setS((p) => ({ ...p, error: "enter a secret" }));
      return;
    }
    setS((p) => ({
      ...p,
      error: null,
      plaintext: null,
      filename: null,
      mime: null,
      plaintextHash: null,
      step: 3,
      busy: "decrypting",
    }));
    // Yield a frame so React can paint the busy state before the heavy work blocks.
    await new Promise((r) => setTimeout(r, 0));
    try {
      let rawKey: Uint8Array;
      try {
        rawKey = fromBase64Url(secret);
      } catch {
        throw new Error("secret is not valid base64url");
      }
      if (rawKey.length !== 32) {
        throw new Error(`secret decodes to ${rawKey.length} bytes — expected 32`);
      }
      const cryptoKey = await importKey(rawKey);
      let decrypted: Uint8Array;
      try {
        decrypted = await decrypt(cryptoKey, s.iv, s.serverCiphertext);
      } catch {
        throw new Error("decryption failed — wrong secret or corrupted file");
      }
      const { meta, body } = unpackPlaintext(decrypted);
      const plaintextHash = await sha256Hex(body);
      setS((p) => ({
        ...p,
        plaintext: body,
        filename: meta.filename,
        mime: meta.mime,
        plaintextHash,
        step: 4,
        busy: null,
      }));
    } catch (err) {
      setS((p) => ({ ...p, error: err instanceof Error ? err.message : String(err), busy: null }));
    }
  }

  const err = !!s.error;

  function download() {
    if (!s.plaintext || !s.filename) return;
    const blob = new Blob([s.plaintext], { type: s.mime ?? "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = s.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderPreview() {
    if (!s.plaintext || !s.mime) return null;
    if (s.mime.startsWith("text/") || s.mime === "application/json") {
      const slice = s.plaintext.subarray(0, TEXT_PREVIEW_CAP);
      const text = new TextDecoder().decode(slice);
      const truncated = s.plaintext.length > TEXT_PREVIEW_CAP;
      return (
        <pre className="preview">
          {text}
          {truncated && `\n\n…(truncated at ${TEXT_PREVIEW_CAP} bytes)`}
        </pre>
      );
    }
    if (s.mime.startsWith("image/")) {
      const blob = new Blob([s.plaintext], { type: s.mime });
      const url = URL.createObjectURL(blob);
      return (
        <div className="preview">
          <img src={url} alt={s.filename ?? ""} />
        </div>
      );
    }
    if (s.mime.startsWith("video/")) {
      const blob = new Blob([s.plaintext], { type: s.mime });
      const url = URL.createObjectURL(blob);
      return (
        <div className="preview">
          <video src={url} controls />
        </div>
      );
    }
    if (s.mime.startsWith("audio/")) {
      const blob = new Blob([s.plaintext], { type: s.mime });
      const url = URL.createObjectURL(blob);
      return (
        <div className="preview">
          <audio src={url} controls />
        </div>
      );
    }
    return (
      <div className="hint">
        Binary file ({s.plaintext.length.toLocaleString()} bytes, {s.mime}). Use Download.
      </div>
    );
  }

  return (
    <>
      <h2>Receive a file</h2>
      <p className="subtitle">
        The server hands you ciphertext. Decryption happens here in your browser.
      </p>

      <Step n={1} title="Read URL" status={statusOf(s.step, 1, err)}>
        <div className="row">file id: <code>{s.id ?? "—"}</code></div>
        <div className="hint">
          The secret in the URL fragment (if any) is read locally and pre-fills the input
          below — it never leaves your browser.
        </div>
      </Step>

      <Step n={2} title="Server's-eye view (ciphertext)" status={statusOf(s.step, 2, err)}>
        {s.serverCiphertext ? (
          <>
            <div className="hint">
              This is exactly what the server returned — random bytes, no plaintext.
            </div>
            <HexPreview
              bytes={s.serverCiphertext}
              label={`ciphertext (${s.serverCiphertext.length.toLocaleString()} bytes)`}
            />
          </>
        ) : (
          <div className="hint">
            {s.busy === "fetching" && <span className="spinner" />}
            fetching ciphertext from server…
          </div>
        )}
      </Step>

      <Step n={3} title="Enter secret and decrypt locally" status={statusOf(s.step, 3, err)}>
        <div className="input-row">
          <input
            type="text"
            value={s.secretInput}
            onChange={(e) => setS((p) => ({ ...p, secretInput: e.target.value }))}
            placeholder="paste the secret"
            disabled={!s.serverCiphertext}
            onKeyDown={(e) => e.key === "Enter" && decryptNow()}
          />
          <button onClick={decryptNow} disabled={!s.serverCiphertext || s.busy === "decrypting"}>
            {s.busy === "decrypting" ? (
              <>
                <span className="spinner" />
                Decrypting…
              </>
            ) : (
              "Decrypt"
            )}
          </button>
        </div>
        {s.plaintext && (
          <div style={{ marginTop: 10 }}>
            <div className="row">
              filename: <code>{s.filename}</code> · mime: <code>{s.mime}</code>
            </div>
            <div className="hint">
              plaintext SHA-256: <code>{s.plaintextHash}</code>
            </div>
            <div style={{ marginTop: 6 }}>
              <HexPreview
                bytes={s.plaintext}
                label={`first bytes of plaintext (${s.plaintext.length.toLocaleString()} bytes total)`}
              />
            </div>
          </div>
        )}
      </Step>

      <Step n={4} title="Preview / download" status={statusOf(s.step, 4, err)}>
        {s.plaintext && (
          <>
            {renderPreview()}
            <div className="button-row">
              <button onClick={download}>Download</button>
            </div>
          </>
        )}
      </Step>

      {s.error && <div className="error-banner">Error: {s.error}</div>}
    </>
  );
}
