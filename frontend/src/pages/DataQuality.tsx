import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, CopyMinus, FileSpreadsheet, FileWarning, Loader2, Rows3, ShieldCheck, Table2, UploadCloud, CalendarX2 } from "lucide-react";
import { useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axis, grid, Tip } from "../components/ChartBits";
import DataTable from "../components/DataTable";
import Gate, { LoadDemoButton } from "../components/Gate";
import Heatmap from "../components/Heatmap";
import { Card, Counter, ExportButton, PageHeader, Panel, cn } from "../components/ui";
import { useFilters } from "../context/Filters";
import { useApi, useScopedApi } from "../hooks/useApi";
import { ApiError, send, type Row } from "../lib/api";
import { fmt, PLABEL } from "../lib/aqi";

const FL = { aqi: "AQI", ...PLABEL } as Record<string, string>;
const STAGES = ["Validate file format & columns", "Inspect missing values", "Detect duplicate records", "Standardise timestamps",
  "Convert pollutant columns to numeric", "Validate AQI & pollutant readings", "Apply documented missing-value rules", "Store cleaned records in SQL",
  "Generate processing report", "Refresh dashboard analytics"];

function Stat({ icon: Icon, label, value, tone = "default", sub }: { icon: typeof Rows3; label: string; value: number | null | undefined; tone?: "default" | "warn" | "bad" | "good"; sub?: string }) {
  const c = { default: "text-forest-800 bg-emerald-50", warn: "text-amber-800 bg-amber-100", bad: "text-red-800 bg-red-100", good: "text-forest-800 bg-emerald-100" }[tone];
  return (
    <Card hover className="p-4">
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl", c)}><Icon size={18} /></span>
      <p className="mt-3 font-display text-3xl font-semibold"><Counter value={value} /></p>
      <p className="text-sm font-medium text-ink-2">{label}</p>
      {sub && <p className="text-xs text-ink-3">{sub}</p>}
    </Card>
  );
}

export function ProcessingReport({ r, title }: { r: Row; title?: string }) {
  const invalidTotal = r.invalid_cells_total ?? 0;
  return (
    <div className="space-y-5">
      {title && <h3 className="text-xl font-semibold">{title}</h3>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Rows3} label="Original records" value={r.original_records} />
        <Stat icon={CheckCircle2} label="Final cleaned records" value={r.final_cleaned_records} tone="good" sub={`${fmt(r.records_retained)} source rows retained`} />
        <Stat icon={CopyMinus} label="Duplicates removed" value={r.duplicates_removed} tone="warn" sub={`+ ${fmt(r.conflicting_duplicates)} conflicting`} />
        <Stat icon={CalendarX2} label="Invalid timestamps" value={r.invalid_timestamps} tone="bad" />
        <Stat icon={FileWarning} label="Missing values detected" value={r.missing_cells_detected} tone="warn" sub="blank / NA cells (kept as NULL)" />
        <Stat icon={AlertCircle} label="Invalid readings" value={invalidTotal} tone="bad" sub="non-numeric, sentinel, out of range" />
        <Stat icon={Table2} label="Sub-hourly rows merged" value={r.aggregated_subhourly} sub="averaged into hourly" />
        <Stat icon={FileSpreadsheet} label="Rows with no measurements" value={r.no_measurement_rows} tone="warn" />
      </div>
      <p className={cn("rounded-xl px-4 py-2.5 text-sm font-medium", r.reconciled ? "bg-emerald-50 text-forest-800" : "bg-red-50 text-red-800")}>
        {r.reconciled ? "✓ Every uploaded row is accounted for: " : "⚠ Row accounting does not balance: "}
        {fmt(r.original_records)} = {fmt(r.final_cleaned_records)} cleaned + {fmt(r.aggregated_subhourly)} merged + {fmt(r.duplicates_removed + r.conflicting_duplicates)} duplicates + {fmt(r.invalid_timestamps)} bad timestamps + {fmt(r.no_measurement_rows)} empty.
        {r.inserted_records != null && <> Inserted {fmt(r.inserted_records)} new, skipped {fmt(r.skipped_existing)} already in the database.</>}
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-3">Cleaning decisions</h4>
          <ul className="space-y-1.5 text-sm text-ink-2">{r.decisions.map((d: string, i: number) => <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />{d}</li>)}</ul>
          <p className="mt-2 text-xs text-ink-3">Raw rows are preserved untouched in <code>raw_records</code> with the decision taken for each.</p>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-3">Column mapping</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(r.columns_mapped).map(([k, v]) => <span key={k} className="rounded-lg bg-paper-2 px-2 py-1 text-xs"><b>{k}</b> ← {String(v)}</span>)}
          </div>
          {r.columns_unmapped.length > 0 && <p className="mt-2 text-xs text-ink-3">Ignored columns: {r.columns_unmapped.join(", ")}</p>}
          <p className="mt-2 text-xs text-ink-3">Resolution: <b>{r.resolution}</b> · {r.stations} station(s) · {String(r.date_min).slice(0, 10)} → {String(r.date_max).slice(0, 10)}</p>
        </div>
      </div>
    </div>
  );
}

function Upload() {
  const { refresh } = useFilters();
  const [file, setFile] = useState<File | null>(null);
  const [station, setStation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Row | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setRes(null);
    const fd = new FormData();
    fd.append("file", file);
    if (station.trim()) fd.append("station_name", station.trim());
    try {
      setRes(await send("POST", "/api/data/upload", fd));
      refresh();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Upload failed - is the API running?"); } finally { setBusy(false); }
  };

  return (
    <Panel title="Upload & process a dataset" subtitle="CSV or Excel exported from OpenCity. Raw rows are kept; a cleaned copy is stored separately.">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <div role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0] ?? null); }}
            className={cn("flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition", drag ? "border-emerald-600 bg-emerald-50" : "border-line hover:border-emerald-500 hover:bg-paper")}>
            <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity }}><UploadCloud size={36} className="text-emerald-600" /></motion.div>
            <p className="mt-2 font-semibold">{file ? file.name : "Drop a CSV / Excel file here, or click to browse"}</p>
            <p className="text-xs text-ink-3">{file ? `${(file.size / 1024).toFixed(0)} KB` : "Needs a date/timestamp column and at least one of AQI, PM2.5, PM10, NO₂, SO₂ (wide format)"}</p>
            <input ref={input} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input value={station} onChange={(e) => setStation(e.target.value)} placeholder="Station name (if the file has no station column)" aria-label="Station name"
              className="h-10 min-w-64 flex-1 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-emerald-600" />
            <button onClick={submit} disabled={!file || busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-forest-900 px-5 text-sm font-semibold text-white transition hover:bg-forest-800 disabled:opacity-50">
              {busy ? <><Loader2 size={16} className="animate-spin" />Processing…</> : <><ShieldCheck size={16} />Run cleaning pipeline</>}
            </button>
          </div>
          {err && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800">{err}</p>}
        </div>
        <ol className="space-y-1.5 text-sm">
          {STAGES.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-2.5 transition", res?.status === "completed" ? "text-forest-800" : "text-ink-3")}>
              <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold", res?.status === "completed" ? "bg-emerald-600 text-white" : "bg-paper-2")}>{res?.status === "completed" ? "✓" : i + 1}</span>{s}
            </li>
          ))}
        </ol>
      </div>
      {res && (
        <div className="mt-6 border-t border-line pt-5">
          {res.status === "already_imported"
            ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{res.message} Nothing was duplicated in the database.</p>
            : <ProcessingReport r={res.report} title={`Processing report · ${file?.name}`} />}
        </div>
      )}
      <div className="mt-5 border-t border-line pt-4 text-center text-sm text-ink-3">No file handy? <span className="inline-block align-middle"><LoadDemoButton /></span></div>
    </Panel>
  );
}

export default function DataQuality() {
  const state = useScopedApi<Row>("/api/data-quality/summary", []);
  const { refreshKey } = useFilters();
  const imports = useApi<Row>("/api/data/imports?page_size=10", refreshKey);

  return (
    <>
      <PageHeader eyebrow="Data quality monitoring" title="Can you trust the numbers?"
        text="Every cleaning decision is counted and visible. Nothing is silently discarded and missing readings are never turned into zeros." />
      <div className="space-y-5">
        <Upload />
        <Gate state={state}>
          {(d) => {
            const t = d.totals;
            const fields: string[] = d.available_fields;
            return (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <Stat icon={Rows3} label="Records processed" value={t.records_processed} />
                  <Stat icon={FileWarning} label="Missing values" value={t.missing_values} tone="warn" />
                  <Stat icon={CopyMinus} label="Duplicates" value={t.duplicates_removed + t.conflicting_duplicates} tone="warn" />
                  <Stat icon={AlertCircle} label="Invalid AQI readings" value={t.invalid_aqi} tone="bad" />
                  <Stat icon={CalendarX2} label="Invalid timestamps" value={t.invalid_timestamps} tone="bad" />
                  <Card hover className="p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-forest-800"><ShieldCheck size={18} /></span>
                    <p className="mt-3 font-display text-3xl font-semibold"><Counter value={t.completeness_pct} decimals={1} />%</p><p className="text-sm font-medium text-ink-2">Data completeness</p><p className="text-xs text-ink-3">of fields present in this dataset</p></Card>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <Panel title="Before vs after cleaning" subtitle="Rows in the raw upload vs rows in the analytical table">
                    <div className="h-56">
                      <ResponsiveContainer>
                        <BarChart data={d.before_after.records} layout="vertical" margin={{ left: 30, right: 20 }}>
                          <CartesianGrid {...grid} horizontal={false} vertical /><XAxis type="number" {...axis} /><YAxis type="category" dataKey="stage" width={110} {...axis} />
                          <Tooltip content={<Tip />} /><Bar dataKey="records" name="Records" radius={[0, 8, 8, 0]} animationDuration={900}><Cell fill="#bcc5c0" /><Cell fill="#1f9d6b" /></Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-ink-3">{fmt(t.records_processed - t.records_retained)} rows were not carried over as separate records: {fmt(t.duplicates_removed)} duplicates, {fmt(t.conflicting_duplicates)} conflicting, {fmt(t.invalid_timestamps)} bad timestamps, {fmt(t.no_measurement_rows)} empty, {fmt(t.aggregated_subhourly)} merged sub-hourly.</p>
                  </Panel>
                  <Panel title="Problem rate by field" subtitle="% of rows missing or invalid in the raw file vs % NULL after cleaning">
                    <div className="h-64">
                      <ResponsiveContainer>
                        <BarChart data={d.before_after.problem_rate_pct.map((r: Row) => ({ ...r, label: FL[r.field] }))} margin={{ left: -10 }}>
                          <CartesianGrid {...grid} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} unit="%" /><Tooltip content={<Tip unit="%" />} /><Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="before" name="Raw file" fill="#e8832a" radius={[6, 6, 0, 0]} animationDuration={900} /><Bar dataKey="after" name="After cleaning" fill="#1f9d6b" radius={[6, 6, 0, 0]} animationDuration={900} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-ink-3">Invalid readings become NULL, not zero or an imputed guess, so a remaining gap is honest.</p>
                  </Panel>
                </div>

                <Panel title="Station-wise missing data" subtitle="% of records with a NULL value, computed in SQL (SUM CASE) · darker = more missing" actions={<ExportButton rows={d.station_missing.map((s: Row) => ({ station: s.station, records: s.records, completeness_pct: s.completeness_pct, ...Object.fromEntries(fields.map((f) => [`missing_${f}_pct`, s.missing_pct[f]])) }))} name="station-missing" />}>
                  <Heatmap rows={d.station_missing.map((s: Row) => s.station.slice(0, 9))} cols={fields.map((f) => FL[f])} unit="% missing" cellW={64}
                    colorFn={(v) => (v < 2 ? "#2e9e5b" : v < 5 ? "#8dbe3f" : v < 10 ? "#e6b422" : v < 20 ? "#e8832a" : "#d64545")}
                    value={(r, c) => d.station_missing[r].missing_pct[fields[c]]} />
                  <div className="mt-3"><DataTable<Row> rows={d.station_missing} pageSize={6} searchKeys={["station"]} exportName="station-completeness"
                    cols={[{ key: "station", label: "Station" }, { key: "records", label: "Records", align: "right", render: (r) => fmt(r.records) }, { key: "completeness_pct", label: "Completeness", align: "right", render: (r) => `${fmt(r.completeness_pct, 1)}%` }]} /></div>
                </Panel>

                <div className="grid gap-5 xl:grid-cols-2">
                  <Panel title="Duplicate records" subtitle="SQL: GROUP BY station + timestamp HAVING COUNT(*) > 1 on preserved raw rows">
                    <p className="mb-3 text-sm text-ink-2"><b>{fmt(d.duplicates.keys)}</b> duplicated keys · <b>{fmt(d.duplicates.extra_rows)}</b> surplus rows</p>
                    <DataTable<Row> rows={d.duplicates.examples} pageSize={5} empty="No duplicates found" cols={[{ key: "station", label: "Station" }, { key: "timestamp_raw", label: "Raw timestamp" }, { key: "copies", label: "Copies", align: "right" }, { key: "first_row", label: "First row", align: "right" }]} />
                  </Panel>
                  <Panel title="What happened to every uploaded row" subtitle="Terminal status of each raw record (SQL GROUP BY)">
                    <div className="h-56">
                      <ResponsiveContainer>
                        <BarChart data={d.record_outcomes} layout="vertical" margin={{ left: 40, right: 20 }}>
                          <CartesianGrid {...grid} horizontal={false} vertical /><XAxis type="number" {...axis} scale="sqrt" /><YAxis type="category" dataKey="status" width={140} {...axis} />
                          <Tooltip content={<Tip />} /><Bar dataKey="records" name="Rows" fill="#2db37c" radius={[0, 8, 8, 0]} animationDuration={900} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                </div>

                <Panel title={`Latest processing report · ${d.latest_report.filename}`} subtitle={`Import #${d.latest_report.import_id}`}>
                  <ProcessingReport r={d.latest_report} />
                </Panel>
              </div>
            );
          }}
        </Gate>

        <Panel title="Import history" subtitle="Repeated imports of the same file are detected and skipped" loading={imports.loading}>
          <DataTable<Row> rows={imports.data?.items ?? []} pageSize={10} empty="No imports yet"
            cols={[{ key: "import_id", label: "#" }, { key: "filename", label: "File", render: (r) => <span>{r.filename}{r.is_demo && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">DEMO</span>}</span> },
              { key: "status", label: "Status", render: (r) => <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", r.status === "completed" ? "bg-emerald-100 text-forest-800" : "bg-red-100 text-red-800")} title={r.error ?? ""}>{r.status}</span> },
              { key: "original_records", label: "Raw rows", align: "right", render: (r) => fmt(r.original_records) }, { key: "inserted_records", label: "Inserted", align: "right", render: (r) => fmt(r.inserted_records) },
              { key: "skipped_existing", label: "Skipped (existing)", align: "right", render: (r) => fmt(r.skipped_existing) }, { key: "uploaded_at", label: "When", render: (r) => String(r.uploaded_at).slice(0, 16).replace("T", " ") }]} />
        </Panel>
      </div>
    </>
  );
}
