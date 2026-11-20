import { Clock, Snowflake, Sun, CloudRain, Leaf } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, grid, Tip } from "../components/ChartBits";
import DataTable from "../components/DataTable";
import DrillDown, { type DrillTarget } from "../components/DrillDown";
import FilterBar from "../components/FilterBar";
import Gate from "../components/Gate";
import Heatmap from "../components/Heatmap";
import { Card, ExportButton, PageHeader, Panel } from "../components/ui";
import type { Scope } from "../context/Filters";
import { useScopedApi } from "../hooks/useApi";
import type { Row } from "../lib/api";
import { colorOf, DOW, fmt, MONTHS } from "../lib/aqi";

const SCOPE: Scope = ["year", "stations", "dates"];
const SEASON_ICON: Record<string, typeof Sun> = { Winter: Snowflake, Summer: Sun, Monsoon: CloudRain, "Post-monsoon": Leaf };

export default function Seasonal() {
  const monthly = useScopedApi<Row>("/api/air-quality/trends/monthly", SCOPE);
  const hourly = useScopedApi<Row>("/api/air-quality/trends/hourly", SCOPE);
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  return (
    <>
      <PageHeader eyebrow="Monthly & hourly analysis" title="When does the air turn?"
        text="Seasonal swings, the hours of the day that hurt most, and day-of-week patterns — each one a SQL window-function query." />
      <FilterBar scope={SCOPE} />
      <Gate state={monthly}>
        {(m) => {
          const years: number[] = [...new Set<number>(m.timeline.map((t: Row) => t.year))].sort();
          const cell = (y: number, mo: number) => m.timeline.find((t: Row) => t.year === y && t.month === mo + 1)?.avg_aqi;
          return (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {m.seasonal.map((s: Row) => {
                  const Icon = SEASON_ICON[s.season] ?? Sun;
                  return (
                    <Card key={s.season} hover className="p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold text-ink-2"><span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: colorOf(s.avg_aqi) + "22", color: colorOf(s.avg_aqi) }}><Icon size={17} /></span>{s.season}</div>
                      <p className="mt-3 font-display text-4xl font-semibold" style={{ color: colorOf(s.avg_aqi) }}>{fmt(s.avg_aqi, 1)}</p>
                      <p className="text-xs text-ink-3">avg AQI · PM2.5 {fmt(s.avg_pm25, 1)} · PM10 {fmt(s.avg_pm10, 1)}</p>
                    </Card>
                  );
                })}
              </div>

              <Panel title="Seasonality: average AQI by month" subtitle="All selected years collapsed into calendar months" insights={m.insights} actions={<ExportButton rows={m.month_of_year} name="month-of-year-aqi" />}>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={m.month_of_year.map((r: Row) => ({ ...r, label: MONTHS[r.month - 1] }))} margin={{ left: -12 }}>
                      <CartesianGrid {...grid} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} />
                      <Tooltip cursor={{ fill: "#0c3a2b10" }} content={<Tip />} />
                      <Bar dataKey="avg_aqi" name="Avg AQI" radius={[8, 8, 0, 0]} animationDuration={900} style={{ cursor: "pointer" }} onClick={(r: any) => setDrill({ title: `All ${MONTHS[r.month - 1]}s`, month: r.month, year: undefined })}>
                        {m.month_of_year.map((r: Row) => <Cell key={r.month} fill={colorOf(r.avg_aqi)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Month-wise heatmap" subtitle="Average AQI per month and year · click a cell for the readings">
                <Heatmap rows={years.map(String)} cols={MONTHS} value={(r, c) => cell(years[r], c)} onCell={(r, c) => setDrill({ title: `${MONTHS[c]} ${years[r]}`, year: years[r], month: c + 1 })} />
              </Panel>

              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title="Most polluted days" subtitle="City-wide daily mean (min. 3 readings), ranked with DENSE_RANK()">
                  <DataTable<Row> rows={m.polluted_days} pageSize={5} exportName="most-polluted-days" onRowClick={(r) => setDrill({ title: String(r.day).slice(0, 10), dateFrom: String(r.day).slice(0, 10), dateTo: String(r.day).slice(0, 10) })}
                    cols={[{ key: "period_rank", label: "#" }, { key: "day", label: "Day", render: (r) => String(r.day).slice(0, 10) }, { key: "avg_aqi", label: "Avg AQI", align: "right", render: (r) => <b style={{ color: colorOf(r.avg_aqi) }}>{fmt(r.avg_aqi, 1)}</b> }, { key: "peak_aqi", label: "Peak", align: "right", render: (r) => fmt(r.peak_aqi) }]} />
                </Panel>
                <Panel title="Most polluted months" subtitle="Top 5 calendar months across the selection">
                  <DataTable<Row> rows={m.polluted_months} pageSize={5} exportName="most-polluted-months" onRowClick={(r) => setDrill({ title: `${MONTHS[r.month - 1]} ${r.year}`, year: r.year, month: r.month })}
                    cols={[{ key: "period_rank", label: "#" }, { key: "month", label: "Month", render: (r) => `${MONTHS[r.month - 1]} ${r.year}` }, { key: "avg_aqi", label: "Avg AQI", align: "right", render: (r) => <b style={{ color: colorOf(r.avg_aqi) }}>{fmt(r.avg_aqi, 1)}</b> }, { key: "readings", label: "Readings", align: "right", render: (r) => fmt(r.readings) }]} />
                </Panel>
              </div>
            </div>
          );
        }}
      </Gate>

      <div className="mt-5">
        <Gate state={hourly} skeleton={<div />}>
          {(h) => !h.hourly_available ? (
            <Panel title="Hourly analysis unavailable" subtitle="This dataset only has daily resolution">
              <p className="text-sm text-ink-2">{h.insights.at(-1)}</p>
            </Panel>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-3">
                <Panel title="Hourly pollution distribution" subtitle="Dark bars are the three peak hours (SQL RANK)" className="xl:col-span-2" insights={h.insights} actions={<ExportButton rows={h.hourly} name="hourly-aqi" />}>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <BarChart data={h.hourly} margin={{ left: -12 }}>
                        <CartesianGrid {...grid} /><XAxis dataKey="hour" {...axis} tickFormatter={(v) => `${String(v).padStart(2, "0")}h`} /><YAxis {...axis} />
                        <Tooltip cursor={{ fill: "#0c3a2b10" }} content={<Tip labelFmt={(l) => `${String(l).padStart(2, "0")}:00`} />} />
                        <Bar dataKey="avg_aqi" name="Avg AQI" radius={[6, 6, 0, 0]} animationDuration={900}>
                          {h.hourly.map((r: Row) => <Cell key={r.hour} fill={r.is_peak ? "#0c3a2b" : "#5ccb9b"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel title="Peak pollution hours" subtitle="Hours ranked by average AQI">
                  <ol className="space-y-3">
                    {h.hourly.filter((r: Row) => r.is_peak).sort((a: Row, b: Row) => a.peak_rank - b.peak_rank).map((r: Row) => (
                      <li key={r.hour} className="flex items-center gap-3 rounded-xl bg-paper p-3">
                        <Clock size={18} className="text-emerald-600" /><span className="font-display text-xl font-semibold">{String(r.hour).padStart(2, "0")}:00</span>
                        <span className="ml-auto text-right text-sm"><b>{fmt(r.avg_aqi, 1)}</b><span className="block text-xs text-ink-3">+{fmt(r.vs_daily_mean, 1)} vs mean</span></span>
                      </li>
                    ))}
                  </ol>
                </Panel>
              </div>
              <div className="grid gap-5 xl:grid-cols-3">
                <Panel title="Day-wise AQI pattern" subtitle="Average by weekday">
                  <div className="h-56">
                    <ResponsiveContainer>
                      <BarChart data={h.day_of_week.map((r: Row) => ({ ...r, label: DOW[r.day_of_week] }))} margin={{ left: -12 }}>
                        <CartesianGrid {...grid} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} />
                        <Tooltip cursor={{ fill: "#0c3a2b10" }} content={<Tip />} />
                        <Bar dataKey="avg_aqi" name="Avg AQI" radius={[6, 6, 0, 0]} animationDuration={900}>{h.day_of_week.map((r: Row) => <Cell key={r.day_of_week} fill={colorOf(r.avg_aqi)} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel title="Weekday × hour heat grid" subtitle="Average AQI for each combination" className="xl:col-span-2">
                  {(() => {
                    const hrs: number[] = [...new Set<number>(h.heatmap.map((x: Row) => x.hour))].sort((a, b) => a - b);
                    return <Heatmap rows={DOW} cols={hrs.map((x) => `${String(x).padStart(2, "0")}h`)} cellW={44}
                      value={(r, c) => h.heatmap.find((x: Row) => x.day_of_week === r && x.hour === hrs[c])?.avg_aqi} />;
                  })()}
                </Panel>
              </div>
            </div>
          )}
        </Gate>
      </div>
      <DrillDown target={drill} onClose={() => setDrill(null)} />
    </>
  );
}
