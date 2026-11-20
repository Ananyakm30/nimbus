import { useState } from "react";
import { colorOf, fmt } from "../lib/aqi";

/** Generic heatmap coloured by CPCB AQI category (or a custom colour function). */
export default function Heatmap({ rows, cols, value, onCell, unit = "AQI", colorFn = colorOf, cellW = 38 }: {
  rows: string[]; cols: string[]; value: (r: number, c: number) => number | null | undefined; onCell?: (r: number, c: number) => void;
  unit?: string; colorFn?: (v: number) => string; cellW?: number;
}) {
  const [hover, setHover] = useState<string>("Hover a cell to read its value");
  return (
    <div>
      <div className="scroll-thin overflow-x-auto pb-2">
        <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: `64px repeat(${cols.length}, ${cellW}px)` }}>
          <div />
          {cols.map((c) => <div key={c} className="text-center text-[11px] font-medium text-ink-3">{c}</div>)}
          {rows.map((rl, r) => (
            <div key={rl} className="contents">
              <div className="flex items-center text-xs font-medium text-ink-2">{rl}</div>
              {cols.map((cl, c) => {
                const v = value(r, c);
                return v == null ? (
                  <div key={cl} className="h-8 rounded-md bg-paper-2/70" title={`${rl} · ${cl}: no data`} />
                ) : (
                  <button key={cl} onMouseEnter={() => setHover(`${rl} · ${cl}: ${fmt(v, 1)} ${unit}`)} onFocus={() => setHover(`${rl} · ${cl}: ${fmt(v, 1)} ${unit}`)}
                    onClick={() => onCell?.(r, c)} aria-label={`${rl} ${cl} ${fmt(v, 1)} ${unit}`}
                    className="h-8 rounded-md text-[10px] font-semibold text-white/95 transition hover:scale-110 hover:shadow-md" style={{ background: colorFn(v) }}>
                    {cellW >= 38 ? Math.round(v) : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-ink-2" aria-live="polite">{hover}</p>
    </div>
  );
}
