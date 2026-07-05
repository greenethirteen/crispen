"use client";

import type { CheckRow, CheckStatus } from "@/lib/types";
import type { PrintSize, PrintUnit } from "@/lib/checks";

const MARK: Record<CheckStatus, { glyph: string; className: string }> = {
  pass: { glyph: "✓", className: "text-ink" },
  fail: { glyph: "✕", className: "text-registration" },
  warn: { glyph: "!", className: "text-registration" },
  info: { glyph: "•", className: "text-proof" },
};

function StatusBadge({ status }: { status: CheckStatus }) {
  const m = MARK[status];
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center border border-current font-mono text-sm font-semibold ${m.className}`}
      aria-label={status}
    >
      {m.glyph}
    </span>
  );
}

export function PrintSizeControl({
  value,
  onChange,
}: {
  value: PrintSize;
  onChange: (next: PrintSize) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-ink/15 pb-4">
      <div>
        <label className="label-mono mb-1 block">Intended print size</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.1"
            value={value.width || ""}
            onChange={(e) =>
              onChange({ ...value, width: parseFloat(e.target.value) || 0 })
            }
            className="w-20 border border-ink/30 bg-white/60 px-2 py-1.5 font-mono text-sm focus:border-proof focus:outline-none"
            placeholder="W"
          />
          <span className="font-mono text-ink/50">×</span>
          <input
            type="number"
            min={0}
            step="0.1"
            value={value.height || ""}
            onChange={(e) =>
              onChange({ ...value, height: parseFloat(e.target.value) || 0 })
            }
            className="w-20 border border-ink/30 bg-white/60 px-2 py-1.5 font-mono text-sm focus:border-proof focus:outline-none"
            placeholder="H"
          />
        </div>
      </div>
      <div className="flex overflow-hidden border border-ink/30">
        {(["in", "cm"] as PrintUnit[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onChange({ ...value, unit: u })}
            className={`px-3 py-1.5 font-mono text-sm uppercase transition-colors ${
              value.unit === u
                ? "bg-ink text-paper"
                : "bg-white/60 text-ink/60 hover:text-ink"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
      <p className="label-mono ml-auto self-center">
        Optional — drives the DPI check
      </p>
    </div>
  );
}

export function RejectReport({ rows }: { rows: CheckRow[] }) {
  const fails = rows.filter((r) => r.status === "fail").length;
  const warns = rows.filter((r) => r.status === "warn").length;

  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-ink pb-2">
        <h2 className="font-display text-xl font-bold">Reject Report</h2>
        <span className="label-mono">
          {fails > 0 ? (
            <span className="text-registration">
              {fails} blocker{fails > 1 ? "s" : ""}
            </span>
          ) : (
            <span>No blockers</span>
          )}
          {warns > 0 && (
            <span>
              {" "}
              · {warns} warning{warns > 1 ? "s" : ""}
            </span>
          )}
        </span>
      </div>

      <ul>
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex gap-4 border-b border-dashed border-ink/20 py-4"
          >
            <StatusBadge status={row.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="font-display font-medium text-ink">
                  {row.label}
                </span>
                <span className="font-mono text-sm text-ink/70">
                  {row.value}
                </span>
              </div>
              <p className="mt-1 font-mono text-[13px] leading-relaxed text-ink/60">
                {row.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
