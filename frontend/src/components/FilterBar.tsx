import { ChevronDown, FilterX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFilters, type Scope } from "../context/Filters";
import { useApi } from "../hooks/useApi";
import { qs, type Row } from "../lib/api";
import { MONTHS } from "../lib/aqi";
import { cn } from "./ui";

export function useStations() {
  const { filters, refreshKey } = useFilters();
  const r = useApi<Row>(`/api/air-quality/stations${qs({ dataset: filters.dataset === "auto" ? undefined : filters.dataset })}`, refreshKey);
  return { stations: (r.data?.items ?? []) as Row[], meta: r.data?.meta, loading: r.loading };
}

const field = "h-9 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink outline-none transition hover:border-emerald-500 focus:border-emerald-600";

export function StationPicker({ multi = true }: { multi?: boolean }) {
  const { filters, set } = useFilters();
  const { stations } = useStations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const sel = filters.stations;
  const toggle = (id: number) => set({ stations: sel.includes(id) ? sel.filter((x) => x !== id) : multi ? [...sel, id] : [id] });
  const label = sel.length === 0 ? "All stations" : sel.length === 1 ? stations.find((s) => s.station_id === sel[0])?.name ?? "1 station" : `${sel.length} stations`;
  return (
    <div className="relative" ref={ref}>
      <button className={cn(field, "flex min-w-40 items-center justify-between gap-2")} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="truncate">{label}</span><ChevronDown size={15} className={cn("transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 max-h-72 w-64 overflow-auto rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]" role="listbox">
          <button className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm font-semibold text-emerald-600 hover:bg-emerald-50" onClick={() => set({ stations: [] })}>All stations</button>
          {stations.map((s) => (
            <label key={s.station_id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-paper">
              <input type="checkbox" className="accent-emerald-600" checked={sel.includes(s.station_id)} onChange={() => toggle(s.station_id)} />{s.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({ scope }: { scope: Scope }) {
  const { filters, set, reset } = useFilters();
  const { stations } = useStations();
  const years = useMemo(() => {
    const ys = stations.flatMap((s) => [s.first_reading, s.last_reading]).filter(Boolean).map((d: string) => +String(d).slice(0, 4));
    if (!ys.length) return [];
    const [a, b] = [Math.min(...ys), Math.max(...ys)];
    return Array.from({ length: b - a + 1 }, (_, i) => b - i);
  }, [stations]);
  const dirty = filters.year || filters.month || filters.stations.length || filters.dateFrom || filters.dateTo;
  const has = (k: Scope[number]) => scope.includes(k);
  const bad = filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo;

  return (
    <div className="glass sticky top-[60px] z-20 -mx-1 mb-6 flex flex-wrap items-center gap-2.5 rounded-2xl p-2.5 shadow-[var(--shadow-card)] lg:top-0">
      {has("year") && (
        <select aria-label="Year" className={field} value={filters.year ?? ""} onChange={(e) => set({ year: e.target.value ? +e.target.value : undefined, dateFrom: undefined, dateTo: undefined })}>
          <option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}
        </select>
      )}
      {has("month") && (
        <select aria-label="Month" className={field} value={filters.month ?? ""} onChange={(e) => set({ month: e.target.value ? +e.target.value : undefined })}>
          <option value="">All months</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      )}
      {has("stations") && <StationPicker />}
      {has("dates") && (
        <div className="flex items-center gap-1.5 text-sm text-ink-3">
          <input type="date" aria-label="From date" className={cn(field, bad && "border-red-500")} value={filters.dateFrom ?? ""} onChange={(e) => set({ dateFrom: e.target.value || undefined, year: undefined })} />
          <span>→</span>
          <input type="date" aria-label="To date" className={cn(field, bad && "border-red-500")} value={filters.dateTo ?? ""} onChange={(e) => set({ dateTo: e.target.value || undefined, year: undefined })} />
        </div>
      )}
      {bad && <span className="text-xs font-semibold text-red-700">Start date is after end date</span>}
      {dirty ? (
        <button onClick={reset} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-forest-800 hover:bg-emerald-50">
          <FilterX size={15} />Reset
        </button>
      ) : <span className="ml-auto pr-2 text-xs text-ink-3">Filters apply to every chart on this page</span>}
    </div>
  );
}
