import type { ReactNode } from "react";

export type StepStatus = "pending" | "active" | "done" | "error";

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
    <div className="step" data-status={status}>
      <div className="step-head">
        <span className="step-num">{n.toString().padStart(2, "0")}</span>
        <span className="step-title">{title}</span>
        <span className={`badge ${status}`}>{status}</span>
      </div>
      {children && <div className="step-body">{children}</div>}
    </div>
  );
}
