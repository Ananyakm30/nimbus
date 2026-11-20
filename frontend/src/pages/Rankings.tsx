import { Crown, Leaf } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, grid, Tip } from "../components/ChartBits";
import type { Col } from "../components/DataTable";
import DataTable from "../components/DataTable";
import DrillDown, { type DrillTarget } from "../components/DrillDown";
import FilterBar from "../components/FilterBar";
import Gate from "../components/Gate";
import { AqiBadge, Card, ExportButton, PageHeader, Panel, useDebounced } from "../components/ui";
import type { Scope } from "../context/Filters";
import { useScopedApi } from "../hooks/useApi";
import type { Row } from "../lib/api";
import { catColor, colorOf, fmt } from "../lib/aqi";

const SCOPE: Scope = ["year", "month", "dates"];

export default function Rankings() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "pollution_rank", dir: "asc" as "asc" | "desc" });
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const state = useScopedApi<Row>("/api/air-quality/rankings", SCOPE, { search: q, sort_by: sort.key, order: sort.dir, page, page_size: 8 });
  const all = useScopedApi<Row>("/api/air-quality/rankings", SCOPE, { page_size: 200 });
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  const cols: Col<Row>[] = [
    { key: "pollution_rank", label: "Rank", render: (r) => <span className="font-display text-lg font-semibold">#{r.pollution_rank}</span> },
    { key: "station", label: "Station", render: (r) => <span className="font-semibold">{r.station}</span> },
    { key: "avg_aqi", label: "Avg AQI", align: "right", render: (r) => <b>{fmt(r.avg_aqi, 1)}</b> },
    { key: "pct_vs_city", label: "vs city", align: "right", sortable: false, render: (r) => <span className={r.pct_vs_city > 0 ? "text-red-700" : "text-forest-700"}>{r.pct_vs_city > 0 ? "+" : ""}{r.pct_vs_city}%</span> },
    { key: "readings", label: "Readings", align: "right", render: (r) => fmt(r.readings) },
    { key: "category", label: "Category", sortable: false, render: (r) => <AqiBadge category={r.category} /> },
  ];

  return (
    <>
      <PageHeader eyebrow="Area-wise AQI ranking" title="Which neighbourhoods breathe worst?"
        text="Stations ranked by average AQI using SQL RANK() and DENSE_RANK(), compared with the city-wide mean." />
      <FilterBar scope={SCOPE} />
      <Gate state={state}>
        {(d) => (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Card hover className="relative overflow-hidden p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-800"><Crown size={16} />Most polluted locations</div>
                <ol className="mt-3 space-y-2">
                  {d.highest.map((r: Row, i: number) => (
                    <li key={r.station_id} className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-red-50 text-xs font-bold text-red-800">{i + 1}</span>
                      <button className="font-semibold hover:underline" onClick={() => setDrill({ title: r.station, stationId: r.station_id })}>{r.station}</button>
                      <span className="ml-auto font-display text-xl font-semibold" style={{ color: colorOf(r.avg_aqi) }}>{fmt(r.avg_aqi, 1)}</span></li>
                  ))}
                </ol>
              </Card>
              <Card hover className="relative overflow-hidden p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-forest-700"><Leaf size={16} />Cleanest locations</div>
                <ol className="mt-3 space-y-2">
                  {d.lowest.map((r: Row, i: number) => (
                    <li key={r.station_id} className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-forest-800">{i + 1}</span>
                      <button className="font-semibold hover:underline" onClick={() => setDrill({ title: r.station, stationId: r.station_id })}>{r.station}</button>
                      <span className="ml-auto font-display text-xl font-semibold" style={{ color: colorOf(r.avg_aqi) }}>{fmt(r.avg_aqi, 1)}</span></li>
                  ))}
                </ol>
              </Card>
            </div>

            <Panel title="Average AQI by station" subtitle="Click a bar to open that station's readings" insights={d.insights}
              actions={<ExportButton rows={all.data?.items} name="station-ranking" />}>
              <div style={{ height: Math.max(220, (all.data?.items.length ?? 6) * 38) }}>
                <ResponsiveContainer>
                  <BarChart data={all.data?.items ?? []} layout="vertical" margin={{ left: 20, right: 24 }}>
                    <CartesianGrid {...grid} horizontal={false} vertical />
                    <XAxis type="number" {...axis} />
                    <YAxis type="category" dataKey="station" width={140} {...axis} />
                    <Tooltip cursor={{ fill: "#0c3a2b10" }} content={<Tip />} />
                    <Bar dataKey="avg_aqi" name="Avg AQI" radius={[0, 8, 8, 0]} animationDuration={900} style={{ cursor: "pointer" }}
                      onClick={(r: any) => setDrill({ title: r.station, stationId: r.station_id })}>
                      {(all.data?.items ?? []).map((r: Row) => <Cell key={r.station_id} fill={catColor(r.category)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Full ranking" subtitle="Rank is computed over all stations in SQL, so searching never changes it">
              <DataTable<Row> rows={d.items} cols={cols} pageSize={8} loading={state.loading} onRowClick={(r) => setDrill({ title: r.station, stationId: r.station_id })}
                highlight={(r) => (r.pollution_rank === 1 ? "#fdecec" : undefined)} exportName="station-ranking-page"
                server={{ total: d.total, page, sort: sort.key, dir: sort.dir, search, onPage: setPage, onSort: (key, dir) => { setSort({ key, dir }); setPage(1); }, onSearch: (s) => { setSearch(s); setPage(1); } }} />
            </Panel>
          </div>
        )}
      </Gate>
      <DrillDown target={drill} onClose={() => setDrill(null)} />
    </>
  );
}
