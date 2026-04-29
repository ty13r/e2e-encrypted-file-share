import { bytesToHex } from "../crypto";

export function HexPreview({
  bytes,
  max = 64,
  label,
}: {
  bytes: Uint8Array;
  max?: number;
  label?: string;
}) {
  const slice = bytes.subarray(0, max);
  const hex = bytesToHex(slice).match(/.{1,2}/g)?.join(" ") ?? "";
  return (
    <div>
      {label && <div className="hex-label">{label}</div>}
      <pre className="hex">
        {hex}
        {bytes.length > max && ` … (${(bytes.length - max).toLocaleString()} more bytes)`}
      </pre>
    </div>
  );
}
