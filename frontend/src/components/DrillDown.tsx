import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useState } from "react";
import { useFilters } from "../context/Filters";
import { useApi } from "../hooks/useApi";
import { qs, type Row } from "../lib/api";
import { fmt } from "../lib/aqi";
import DataTable from "./DataTable";
import { AqiBadge } from "./ui";

export interface DrillTarget {
  title: string;
  year?: number;
  month?: number;
  stationId?: number;
  dateFrom?: string;
  dateTo?: string;
}

/** Slide-over listing the raw readings behind a clicked chart element. */
export default function DrillDown({ target, onClose }: { target: DrillTarget | null; onClose: () => void }) {
  const { filters } = useFilters();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "aqi", dir: "desc" });
  const path = target
    ? `/api/air-quality/readings${qs({
        dataset: filters.dataset === "auto" ? undefined : filters.dataset,
        year: target.year, month: target.month, station_id: target.stationId ? [target.stationId] : filters.stations,
        date_from: target.dateFrom, date_to: target.dateTo, page, page_size: 10, sort: sort.key, direction: sort.dir,
      })}`
    : null;
  const { data, loading } = useApi<Row>(path);
  const num = (k: string) => ({ key: k, label: k === "aqi" ? "AQI" : k.toUpperCase().replace("PM25", "PM2.5"), align: "right" as const, render: (r: Row) => fmt(r[k], 0) });

  return (
    <AnimatePresence>
      {target && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-forest-950/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside role="dialog" aria-label={target.title} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-paper shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
            <header className="flex items-start justify-between border-b border-line bg-white p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Drill-down · underlying readings</p>
                <h2 className="mt-1 text-2xl font-semibold">{target.title}</h2>
                <p className="text-sm text-ink-3">Sorted by {sort.key}; showing raw cleaned records from the SQL table.</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-paper-2"><X size={18} /></button>
            </header>
            <div className="flex-1 overflow-auto p-5">
              <DataTable<Row>
                rows={data?.items ?? []} loading={loading} pageSize={10}
                server={{ total: data?.total ?? 0, page, sort: sort.key, dir: sort.dir, search: "", onPage: setPage, onSort: (key, dir) => { setSort({ key, dir }); setPage(1); }, onSearch: () => {} }}
                cols={[
                  { key: "station", label: "Station" },
                  { key: "ts", label: "Time", render: (r) => String(r.ts).replace("T", " ").slice(0, 16) },
                  { ...num("aqi"), render: (r) => <span className="inline-flex items-center gap-2">{fmt(r.aqi, 0)}<AqiBadge aqi={r.aqi} /></span> },
                  num("pm25"), num("pm10"), num("no2"), num("so2"),
                ]}
                exportName={`readings-${target.title}`}
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
