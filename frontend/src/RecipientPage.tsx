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
    setS((p) => ({ ...p, step: 2 }));

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
      setS((p) => ({ ...p, serverCiphertext, iv, step: 3 }));
    } catch (err) {
      setS((p) => ({ ...p, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function decryptNow() {
    if (!s.serverCiphertext || !s.iv) return;
    const secret = s.secretInput.trim();
    if (!secret) {
      setS((p) => ({ ...p, error: "enter a secret" }));
      return;
    }
    setS((p) => ({ ...p, error: null, plaintext: null, filename: null, mime: null, plaintextHash: null, step: 3 }));
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
      }));
    } catch (err) {
      setS((p) => ({ ...p, error: err instanceof Error ? err.message : String(err) }));
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
        <pre
          style={{
            background: "#f4f4f4",
            padding: 8,
            maxHeight: 300,
            overflow: "auto",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
          {truncated && `\n\n…(truncated at ${TEXT_PREVIEW_CAP} bytes)`}
        </pre>
      );
    }
    if (s.mime.startsWith("image/")) {
      const blob = new Blob([s.plaintext], { type: s.mime });
      const url = URL.createObjectURL(blob);
      return <img src={url} alt={s.filename ?? ""} style={{ maxWidth: "100%", maxHeight: 300 }} />;
    }
    if (s.mime.startsWith("video/")) {
      const blob = new Blob([s.plaintext], { type: s.mime });
      const url = URL.createObjectURL(blob);
      return <video src={url} controls style={{ maxWidth: "100%", maxHeight: 360 }} />;
    }
    if (s.mime.startsWith("audio/")) {
      const blob = new Blob([s.plaintext], { type: s.mime });
      const url = URL.createObjectURL(blob);
      return <audio src={url} controls />;
    }
    return (
      <div style={{ fontSize: 12, color: "#555" }}>
        Binary file ({s.plaintext.length.toLocaleString()} bytes, {s.mime}). Use Download.
      </div>
    );
  }

  return (
    <div>
      <h2>Receive a file</h2>

      <Step n={1} title="Read URL" status={statusOf(s.step, 1, err)}>
        <div>file id: <code>{s.id ?? "—"}</code></div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
          The secret in the URL fragment (if any) is read locally and pre-fills the
          input below — it never leaves your browser.
        </div>
      </Step>

      <Step n={2} title="Server's-eye view (ciphertext)" status={statusOf(s.step, 2, err)}>
        {s.serverCiphertext ? (
          <>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
              This is exactly what the server returned — random bytes, no plaintext.
            </div>
            <HexPreview bytes={s.serverCiphertext} label={`ciphertext (${s.serverCiphertext.length} bytes)`} />
          </>
        ) : (
          <span style={{ color: "#888" }}>fetching…</span>
        )}
      </Step>

      <Step n={3} title="Enter secret and decrypt locally" status={statusOf(s.step, 3, err)}>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <input
            type="text"
            value={s.secretInput}
            onChange={(e) => setS((p) => ({ ...p, secretInput: e.target.value }))}
            placeholder="paste the secret"
            style={{ flex: 1, padding: 6, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}
            disabled={!s.serverCiphertext}
          />
          <button onClick={decryptNow} disabled={!s.serverCiphertext}>
            Decrypt
          </button>
        </div>
        {s.plaintext && (
          <div style={{ marginTop: 8 }}>
            <div>filename: <code>{s.filename}</code> · mime: <code>{s.mime}</code></div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              plaintext SHA-256: <code>{s.plaintextHash}</code>
            </div>
            <div style={{ marginTop: 6 }}>
              <HexPreview bytes={s.plaintext} label={`first bytes of plaintext (${s.plaintext.length} bytes total)`} />
            </div>
          </div>
        )}
      </Step>

      <Step n={4} title="Preview / download" status={statusOf(s.step, 4, err)}>
        {s.plaintext && (
          <>
            {renderPreview()}
            <button style={{ marginTop: 8 }} onClick={download}>Download</button>
          </>
        )}
      </Step>

      {s.error && <div style={{ color: "crimson", marginTop: 12 }}>Error: {s.error}</div>}
    </div>
  );
}
