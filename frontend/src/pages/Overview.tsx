import { Activity, Database, Gauge, MapPin, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, grid, Tip } from "../components/ChartBits";
import DrillDown, { type DrillTarget } from "../components/DrillDown";
import FilterBar from "../components/FilterBar";
import Gate from "../components/Gate";
import Mascot from "../components/Mascot";
import { Counter, ExportButton, InsightList, KpiCard, PageHeader, Panel } from "../components/ui";
import { useScopedApi } from "../hooks/useApi";
import { catColor, categoryOf, CATEGORIES, fmt, moodOf, ymLabel } from "../lib/aqi";
import type { Row } from "../lib/api";
import type { Scope } from "../context/Filters";

const SCOPE: Scope = ["year", "month", "stations", "dates"];

export default function Overview() {
  const state = useScopedApi<Row>("/api/dashboard/overview", SCOPE);
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  return (
    <>
      <PageHeader eyebrow="Analytics dashboard" title="Bengaluru at a glance"
        text="Headline air-quality indicators computed in SQL from the cleaned records, filtered however you like."
        right={state.data?.kpis && (
          <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-2 shadow-[var(--shadow-card)]">
            <Mascot size={72} mood={moodOf(state.data.kpis.avg_aqi.value)} />
            <div className="text-sm"><p className="text-ink-3">Right now Nimbus feels</p><p className="font-semibold">{categoryOf(state.data.kpis.avg_aqi.value)?.name ?? "—"}</p></div>
          </div>
        )} />
      <FilterBar scope={SCOPE} />
      <Gate state={state}>
        {(d) => {
          const k = d.kpis;
          const cl = d.comparison?.available ? d.comparison.label : undefined;
          return (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <KpiCard icon={Gauge} label="Average AQI" value={k.avg_aqi.value} decimals={1} change={k.avg_aqi.change_pct} changeLabel={cl}
                  hint={`Mean of all valid readings · ${categoryOf(k.avg_aqi.value)?.name ?? ""}`} accent={catColor(categoryOf(k.avg_aqi.value)?.name ?? "")} />
                <KpiCard icon={TrendingUp} label="Highest AQI" value={k.max_aqi.value} change={k.max_aqi.change_pct} changeLabel={cl} accent="#d64545"
                  hint={k.max_aqi.station ? `${k.max_aqi.station} · ${String(k.max_aqi.at).slice(0, 10)}` : "Peak reading"} />
                <KpiCard icon={TrendingDown} label="Lowest AQI" value={k.min_aqi.value} change={k.min_aqi.change_pct} changeLabel={cl} accent="#2e9e5b"
                  hint={k.min_aqi.station ? `${k.min_aqi.station} · ${String(k.min_aqi.at).slice(0, 10)}` : "Cleanest reading"} />
                <KpiCard icon={MapPin} label="Monitoring stations" value={k.stations.value} change={k.stations.change_pct} changeLabel={cl} invert={false}
                  hint="Stations reporting in the selected period" />
                <KpiCard icon={Database} label="Air quality records" value={k.records.value} change={k.records.change_pct} changeLabel={cl} invert={false}
                  hint="Cleaned hourly/daily records after de-duplication" />
                <KpiCard icon={ShieldCheck} label="Data completeness" value={k.completeness.value} decimals={1} suffix="%" change={k.completeness.change_pct} changeLabel={cl} invert={false}
                  hint="Non-null cells among the fields this dataset actually has" accent="#3b82a0" />
              </div>

              <div className="grid gap-5 xl:grid-cols-3">
                <Panel title="Monthly average AQI" subtitle="Click any point to inspect the readings behind it" className="xl:col-span-2"
                  actions={<ExportButton rows={d.timeline} name="monthly-aqi" />}>
                  <div className="h-72">
                    <ResponsiveContainer>
                      <AreaChart data={d.timeline} margin={{ left: -12, right: 8, top: 8 }}
                        onClick={(e: any) => { const p = e?.activePayload?.[0]?.payload; if (p) setDrill({ title: ymLabel(p.ym), year: p.year, month: p.month }); }}>
                        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1f9d6b" stopOpacity={0.45} /><stop offset="100%" stopColor="#1f9d6b" stopOpacity={0.02} /></linearGradient></defs>
                        <CartesianGrid {...grid} />
                        <XAxis dataKey="ym" {...axis} tickFormatter={ymLabel} minTickGap={36} />
                        <YAxis {...axis} />
                        <ReferenceLine y={100} stroke="#e6b422" strokeDasharray="4 4" label={{ value: "Satisfactory limit", fill: "#b08a10", fontSize: 11, position: "insideTopRight" }} />
                        <Tooltip content={<Tip labelFmt={(l) => ymLabel(Number(l))} />} />
                        <Area type="monotone" dataKey="avg_aqi" name="Avg AQI" stroke="#0c3a2b" strokeWidth={2.4} fill="url(#g)" animationDuration={1200} activeDot={{ r: 6, style: { cursor: "pointer" } }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel title="Air quality categories" subtitle="Share of readings (CPCB scale)">
                  <div className="relative h-52">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={d.categories} dataKey="readings" nameKey="category" innerRadius={62} outerRadius={88} paddingAngle={2} animationDuration={1000}>
                          {d.categories.map((c: Row) => <Cell key={c.category} fill={catColor(c.category)} stroke="none" />)}
                        </Pie>
                        <Tooltip formatter={(v: number, n: string) => [`${v.toLocaleString("en-IN")} readings`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                      <div><Counter value={k.avg_aqi.value} decimals={0} className="font-display text-3xl font-semibold" /><p className="text-[11px] text-ink-3">avg AQI</p></div>
                    </div>
                  </div>
                  <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    {CATEGORIES.map((c) => {
                      const row = d.categories.find((x: Row) => x.category === c.name);
                      return <li key={c.name} className="flex items-center gap-1.5 text-ink-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.name}<b className="ml-auto text-ink">{row ? `${row.share_pct}%` : "0%"}</b></li>;
                    })}
                  </ul>
                </Panel>
              </div>

              <Panel title="What the data says" subtitle="Generated from the query results above, not pre-written">
                <InsightList items={d.insights.length ? d.insights : ["Not enough data in this selection to derive insights."]} />
                <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3"><Activity size={13} />Coverage {String(d.coverage.first).slice(0, 10)} → {String(d.coverage.last).slice(0, 10)} · {fmt(k.records.value)} records</p>
              </Panel>
            </div>
          );
        }}
      </Gate>
      <DrillDown target={drill} onClose={() => setDrill(null)} />
    </>
  );
}
