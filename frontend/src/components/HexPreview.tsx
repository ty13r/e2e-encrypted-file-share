import { bytesToHex } from "../crypto";

export function HexPreview({ bytes, max = 64, label }: { bytes: Uint8Array; max?: number; label?: string }) {
  const slice = bytes.subarray(0, max);
  const hex = bytesToHex(slice).match(/.{1,2}/g)?.join(" ") ?? "";
  return (
    <div>
      {label && <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{label}</div>}
      <pre
        style={{
          background: "#111",
          color: "#7f0",
          padding: 8,
          margin: 0,
          fontSize: 11,
          overflowX: "auto",
          borderRadius: 4,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      >
        {hex}
        {bytes.length > max && ` … (${bytes.length - max} more bytes)`}
      </pre>
    </div>
  );
}
