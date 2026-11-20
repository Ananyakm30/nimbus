import { ArrowDownRight, ArrowUpRight, Equal } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, grid, Tip } from "../components/ChartBits";
import DataTable from "../components/DataTable";
import FilterBar from "../components/FilterBar";
import Gate from "../components/Gate";
import { Card, ChangeChip, ExportButton, PageHeader, Panel } from "../components/ui";
import type { Scope } from "../context/Filters";
import { useScopedApi } from "../hooks/useApi";
import type { Row } from "../lib/api";
import { fmt, SERIES } from "../lib/aqi";

const SCOPE: Scope = ["stations", "dates"];
const TREND = {
  improving: { label: "Improving", cls: "bg-emerald-100 text-forest-800", Icon: ArrowDownRight },
  deteriorating: { label: "Deteriorating", cls: "bg-red-100 text-red-800", Icon: ArrowUpRight },
  stable: { label: "Stable", cls: "bg-paper-2 text-ink-2", Icon: Equal },
  baseline: { label: "Baseline year", cls: "bg-paper-2 text-ink-3", Icon: Equal },
} as const;

export default function Trends() {
  const state = useScopedApi<Row>("/api/air-quality/trends/yearly", SCOPE);
  const [hidden, setHidden] = useState<string[]>([]);

  const { chart, names } = useMemo(() => {
    const d = state.data;
    if (!d) return { chart: [], names: [] as string[] };
    const byYear = new Map<number, Row>();
    d.city.forEach((c: Row) => byYear.set(c.year, { year: c.year, "City average": c.avg_aqi }));
    const ns = new Set<string>();
    d.stations.forEach((s: Row) => { ns.add(s.station); (byYear.get(s.year) ?? byYear.set(s.year, { year: s.year }).get(s.year)!)[s.station] = s.avg_aqi; });
    return { chart: [...byYear.values()].sort((a, b) => a.year - b.year), names: [...ns] };
  }, [state.data]);

  return (
    <>
      <PageHeader eyebrow="Historical pollution trends" title="Is the air getting better?"
        text="Year-over-year AQI computed with SQL LAG()/LEAD(). Pick several stations in the filter bar to compare their histories." />
      <FilterBar scope={SCOPE} />
      <Gate state={state}>
        {(d) => (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(["improving", "deteriorating", "stable"] as const).map((k) => {
                const T = TREND[k];
                return (
                  <Card key={k} hover className="p-5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${T.cls}`}><T.Icon size={14} />{T.label}</span>
                    <p className="mt-3 font-display text-4xl font-semibold">{d.trend_summary[k]}</p>
                    <p className="text-sm text-ink-3">station(s) in the latest year (±2% band)</p>
                  </Card>
                );
              })}
              <Card hover className="p-5">
                <p className="text-sm font-semibold text-ink-2">Latest year-on-year</p>
                <p className="mt-2 font-display text-4xl font-semibold">{d.city.length ? fmt(d.city[d.city.length - 1].avg_aqi, 1) : "—"}</p>
                <div className="mt-2"><ChangeChip pct={d.city.length ? d.city[d.city.length - 1].pct_change : null} label={d.city.length ? `since ${d.city[d.city.length - 1].year - 1}` : ""} /></div>
              </Card>
            </div>

            <Panel title="Year-wise average AQI" subtitle="Bold line is the city average of the selected stations · click legend entries to hide/show lines" insights={d.insights}
              actions={<ExportButton rows={d.stations} name="yearly-aqi-by-station" />}>
              <div className="h-80">
                <ResponsiveContainer>
                  <LineChart data={chart} margin={{ left: -10, right: 12, top: 6 }}>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="year" {...axis} type="number" domain={["dataMin", "dataMax"]} allowDecimals={false} />
                    <YAxis {...axis} />
                    <Tooltip content={<Tip />} />
                    <Legend onClick={(e: any) => setHidden((h) => (h.includes(e.dataKey) ? h.filter((x) => x !== e.dataKey) : [...h, e.dataKey]))} wrapperStyle={{ cursor: "pointer", fontSize: 12 }} />
                    <Line dataKey="City average" stroke="#0c3a2b" strokeWidth={4} dot={{ r: 4 }} hide={hidden.includes("City average")} animationDuration={1100} />
                    {names.map((n, i) => (
                      <Line key={n} dataKey={n} stroke={SERIES[(i + 1) % SERIES.length]} strokeWidth={1.8} dot={{ r: 2.5 }} hide={hidden.includes(n)} connectNulls animationDuration={1100} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Year-over-year change" subtitle="Percentage change in average AQI against the previous year (SQL LAG)">
              <DataTable<Row> rows={d.stations} pageSize={10} searchKeys={["station", "year"]} exportName="yoy-change"
                cols={[
                  { key: "station", label: "Station" },
                  { key: "year", label: "Year", render: (r) => <span>{r.year}{r.months_covered < 12 && <span title={`${r.months_covered} months of data`} className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">PARTIAL</span>}</span> },
                  { key: "avg_aqi", label: "Avg AQI", align: "right", render: (r) => fmt(r.avg_aqi, 1) },
                  { key: "prev_year_aqi", label: "Prev. year", align: "right", render: (r) => fmt(r.prev_year_aqi, 1) },
                  { key: "pct_change", label: "Change", align: "right", render: (r) => (r.pct_change == null ? "—" : <ChangeChip pct={r.pct_change} />) },
                  { key: "trend", label: "Trend", sortable: false, render: (r) => { const T = TREND[r.trend as keyof typeof TREND]; return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${T.cls}`}><T.Icon size={12} />{T.label}</span>; } },
                ]} />
            </Panel>
          </div>
        )}
      </Gate>
    </>
  );
}
