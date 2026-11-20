import { fmt } from "../lib/aqi";

export const axis = { stroke: "#7b8a83", fontSize: 12, tickLine: false, axisLine: false } as const;
export const grid = { stroke: "#e6e4da", strokeDasharray: "3 4", vertical: false } as const;

export function Tip({ active, payload, label, unit = "", labelFmt }: {
  active?: boolean; payload?: { name: string; value: number; color: string; payload: Record<string, unknown> }[]; label?: string | number; unit?: string; labelFmt?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white/95 px-3 py-2 text-xs shadow-[var(--shadow-lift)] backdrop-blur">
      {label !== undefined && <p className="mb-1 font-bold text-ink">{labelFmt ? labelFmt(label) : label}</p>}
      {payload.filter((p) => p.value != null).map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}: <b className="text-ink">{fmt(p.value, 1)}{unit}</b>
        </p>
      ))}
    </div>
  );
}
