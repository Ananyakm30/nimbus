import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, grid, Tip } from "../components/ChartBits";
import DataTable from "../components/DataTable";
import FilterBar from "../components/FilterBar";
import Gate from "../components/Gate";
import { Card, ExportButton, PageHeader, Panel, Segmented } from "../components/ui";
import type { Scope } from "../context/Filters";
import { useScopedApi } from "../hooks/useApi";
import type { Row } from "../lib/api";
import { fmt, MONTHS, PCOLOR, PLABEL, ymLabel } from "../lib/aqi";

const SCOPE: Scope = ["year", "month", "stations", "dates"];
const UNIT = "µg/m³";

export default function Pollutants() {
  const [pol, setPol] = useState<string | undefined>();
  const state = useScopedApi<Row>("/api/air-quality/pollutants", SCOPE, { pollutant: pol });

  return (
    <>
      <PageHeader eyebrow="Pollutant analysis" title="What are we actually breathing?"
        text="PM2.5, PM10, NO₂ and SO₂ — only the pollutants present in your dataset are shown; absent ones are never treated as zero." />
      <FilterBar scope={SCOPE} />
      <Gate state={state}>
        {(d) => {
          const focus: string = d.focus;
          const avail: string[] = d.available;
          return (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Object.keys(PLABEL).map((p) => {
                  const on = avail.includes(p);
                  return (
                    <Card key={p} hover={on} className={`p-5 ${on ? "" : "bg-paper-2/60"}`}>
                      <div className="flex items-center justify-between"><span className="text-sm font-semibold text-ink-2">{PLABEL[p]}</span><span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? PCOLOR[p] : "#c8c6bb" }} /></div>
                      {on ? (<>
                        <p className="mt-2 font-display text-4xl font-semibold">{fmt(d.summary[`avg_${p}`], 1)}<span className="ml-1 text-sm font-sans font-normal text-ink-3">{UNIT}</span></p>
                        <p className="text-xs text-ink-3">range {fmt(d.summary[`min_${p}`], 0)} – {fmt(d.summary[`max_${p}`], 0)} · {fmt(d.summary[`n_${p}`])} readings</p>
                      </>) : <p className="mt-3 text-sm text-ink-3">Not available in this dataset</p>}
                    </Card>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-ink-2">Focus pollutant</span>
                <Segmented value={focus} onChange={setPol} options={avail.map((p) => ({ value: p, label: PLABEL[p] }))} />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title={`${PLABEL[focus]} by station`} subtitle={`Station-wise concentration comparison (${UNIT})`} insights={d.insights} actions={<ExportButton rows={d.by_station} name="pollutants-by-station" />}>
                  <div style={{ height: Math.max(240, d.by_station.length * 34) }}>
                    <ResponsiveContainer>
                      <BarChart data={[...d.by_station].sort((a: Row, b: Row) => (b[focus] ?? 0) - (a[focus] ?? 0))} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <CartesianGrid {...grid} horizontal={false} vertical /><XAxis type="number" {...axis} /><YAxis type="category" dataKey="station" width={130} {...axis} />
                        <Tooltip cursor={{ fill: "#0c3a2b10" }} content={<Tip unit={` ${UNIT}`} />} />
                        <Bar dataKey={focus} name={PLABEL[focus]} fill={PCOLOR[focus]} radius={[0, 8, 8, 0]} animationDuration={900} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel title={`${PLABEL[focus]} distribution`} subtitle="Share of readings per concentration band (CPCB breakpoints)">
                  <div className="h-72">
                    <ResponsiveContainer>
                      <BarChart data={d.distribution} margin={{ left: -10 }}>
                        <CartesianGrid {...grid} /><XAxis dataKey="bin" {...axis} /><YAxis {...axis} unit="%" />
                        <Tooltip cursor={{ fill: "#0c3a2b10" }} content={<Tip unit="%" />} />
                        <Bar dataKey="share_pct" name="Share of readings" radius={[8, 8, 0, 0]} animationDuration={900}>
                          {d.distribution.map((_: Row, i: number) => <Cell key={i} fill={["#2e9e5b", "#8dbe3f", "#e6b422", "#e8832a", "#d64545", "#8c2f5b"][i] ?? "#8c2f5b"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 text-xs text-ink-3">Bands: {UNIT}, from "Good" (green) to "Severe" (purple).</p>
                </Panel>
              </div>

              <Panel title="Monthly pollutant trends" subtitle="Monthly mean concentration of every available pollutant">
                <div className="h-72">
                  <ResponsiveContainer>
                    <LineChart data={d.monthly} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid {...grid} /><XAxis dataKey="ym" {...axis} tickFormatter={ymLabel} minTickGap={40} /><YAxis {...axis} />
                      <Tooltip content={<Tip unit={` ${UNIT}`} labelFmt={(l) => ymLabel(Number(l))} />} /><Legend wrapperStyle={{ fontSize: 12 }} />
                      {avail.map((p) => <Line key={p} dataKey={p} name={PLABEL[p]} stroke={PCOLOR[p]} strokeWidth={2.2} dot={false} connectNulls animationDuration={1100} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title="Seasonal profile" subtitle="Average by calendar month">
                  <div className="h-60">
                    <ResponsiveContainer>
                      <LineChart data={d.seasonality.map((r: Row) => ({ ...r, label: MONTHS[r.month - 1] }))} margin={{ left: -10 }}>
                        <CartesianGrid {...grid} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} /><Tooltip content={<Tip unit={` ${UNIT}`} />} />
                        {avail.map((p) => <Line key={p} dataKey={p} name={PLABEL[p]} stroke={PCOLOR[p]} strokeWidth={2.2} dot={{ r: 2.5 }} animationDuration={1100} />)}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel title="Station comparison table" subtitle="Ranks use SQL RANK() per pollutant">
                  <DataTable<Row> rows={d.by_station} pageSize={6} searchKeys={["station"]} exportName="pollutant-station-table"
                    cols={[{ key: "station", label: "Station" }, ...avail.map((p) => ({ key: p, label: PLABEL[p], align: "right" as const, render: (r: Row) => <span>{fmt(r[p], 1)} <span className="text-xs text-ink-3">#{r[`rank_${p}`]}</span></span> }))]} />
                </Panel>
              </div>
            </div>
          );
        }}
      </Gate>
    </>
  );
}
