import type { ReactNode } from "react";

export type StepStatus = "pending" | "active" | "done" | "error";

const STATUS_COLOR: Record<StepStatus, string> = {
  pending: "#888",
  active: "#0a7",
  done: "#0a0",
  error: "#c33",
};

export function Step({
  n,
  title,
  status,
  children,
}: {
  n: number;
  title: string;
  status: StepStatus;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${STATUS_COLOR[status]}`,
        borderLeftWidth: 4,
        borderRadius: 6,
        padding: 12,
        margin: "8px 0",
        background: status === "pending" ? "#fafafa" : "#fff",
        opacity: status === "pending" ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ color: STATUS_COLOR[status], fontWeight: 700 }}>{n}.</span>
        <strong>{title}</strong>
        <span style={{ marginLeft: "auto", fontSize: 12, color: STATUS_COLOR[status] }}>
          {status}
        </span>
      </div>
      {children && <div style={{ marginTop: 8, fontSize: 13 }}>{children}</div>}
    </div>
  );
}
