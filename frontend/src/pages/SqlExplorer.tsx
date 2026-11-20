import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Copy, Loader2, Search } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import FilterBar from "../components/FilterBar";
import Gate from "../components/Gate";
import { ExportButton, PageHeader, cn } from "../components/ui";
import type { Scope } from "../context/Filters";
import { useApi, useScopedApi, useScopeQuery } from "../hooks/useApi";
import type { Row } from "../lib/api";

const SCOPE: Scope = ["year", "month", "stations", "dates"];
const KW = /\b(WITH|AS|SELECT|FROM|WHERE|AND|OR|NOT|NULL|IS|IN|JOIN|LEFT|ON|CROSS|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|OVER|PARTITION BY|CASE|WHEN|THEN|ELSE|END|UNION ALL|DESC|ASC|DISTINCT|BETWEEN)\b/g;
const FN = /\b(COUNT|AVG|MAX|MIN|SUM|ROUND|NULLIF|RANK|DENSE_RANK|ROW_NUMBER|LAG|LEAD)(?=\()/g;

function highlight(sql: string): ReactNode[] {
  const parts = sql.split(/('[^']*'|:[a-z_0-9]+|\b\d+(?:\.\d+)?\b)/g);
  return parts.map((p, i) => {
    if (/^'/.test(p)) return <span key={i} className="text-amber-300">{p}</span>;
    if (/^:/.test(p)) return <span key={i} className="text-sky-300">{p}</span>;
    if (/^\d/.test(p)) return <span key={i} className="text-orange-300">{p}</span>;
    const seg: ReactNode[] = [];
    let last = 0;
    const all = [...p.matchAll(KW)].map((m) => ({ i: m.index!, t: m[0], k: "kw" })).concat([...p.matchAll(FN)].map((m) => ({ i: m.index!, t: m[0], k: "fn" }))).sort((a, b) => a.i - b.i);
    all.forEach((m, j) => {
      if (m.i < last) return;
      seg.push(p.slice(last, m.i));
      seg.push(<span key={j} className={m.k === "kw" ? "font-semibold text-emerald-300" : "text-violet-300"}>{m.t}</span>);
      last = m.i + m.t.length;
    });
    seg.push(p.slice(last));
    return <Fragment key={i}>{seg}</Fragment>;
  });
}

function QueryCard({ q: summary }: { q: Row }) {
  const [open, setOpen] = useState(false);
  const sq = useScopeQuery(SCOPE);
  const live = useApi<Row>(open ? `/api/sql/queries/${summary.id}${sq}` : null);
  const q: Row = live.data ?? summary;
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(q.sql); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left hover:bg-paper/60">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{q.title}</p>
          <p className="mt-0.5 text-xs text-ink-3">{q.endpoint}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{q.features.map((f: string) => <span key={f} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-forest-800">{f}</span>)}</div>
        </div>
        <ChevronDown className={cn("mt-1 shrink-0 text-ink-3 transition", open && "rotate-180")} size={18} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-4 border-t border-line p-4">
              <p className="text-sm text-ink-2">{q.explanation}</p>
              <div className="relative">
                <button onClick={copy} className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-white hover:bg-white/20">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button>
                <pre className="scroll-thin max-h-96 overflow-auto rounded-xl bg-forest-950 p-4 pr-20 font-mono text-[12.5px] leading-relaxed text-emerald-50">{highlight(q.sql)}</pre>
              </div>
              {Object.keys(q.parameters).length > 0 && <p className="text-xs text-ink-3">Bound parameters: {Object.entries(q.parameters).map(([k, v]) => `:${k} = ${v}`).join(" · ")}</p>}
              {live.loading && !live.data ? <p className="flex items-center gap-2 text-sm text-ink-3"><Loader2 size={15} className="animate-spin" />Running the query…</p> : live.error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{live.error}</p> : q.error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{q.error}</p> : !q.rows ? null : (
                <div>
                  <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-ink-3">Result preview · {q.row_count} row(s)</p><ExportButton rows={q.rows} name={q.id} /></div>
                  <div className="scroll-thin overflow-x-auto rounded-xl border border-line">
                    <table className="w-full text-xs">
                      <thead className="bg-paper text-ink-3"><tr>{q.columns.map((c: string) => <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-semibold">{c}</th>)}</tr></thead>
                      <tbody>{q.rows.map((r: Row, i: number) => <tr key={i} className="border-t border-line">{q.columns.map((c: string) => <td key={c} className="whitespace-nowrap px-3 py-1.5 tabular-nums">{r[c] == null ? "—" : String(r[c]).slice(0, 40)}</td>)}</tr>)}</tbody>
                    </table>
                    {q.rows.length === 0 && <p className="p-4 text-center text-ink-3">No rows for the current filters</p>}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SqlExplorer() {
  const state = useScopedApi<Row>("/api/sql/queries", SCOPE);
  const [q, setQ] = useState("");
  const [feat, setFeat] = useState<string | null>(null);
  const feats = useMemo(() => [...new Set<string>((state.data?.items ?? []).flatMap((i: Row) => i.features))].sort(), [state.data]);
  const items = (state.data?.items ?? []).filter((i: Row) =>
    (!feat || i.features.includes(feat)) && (!q || (i.title + i.explanation + i.sql).toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <PageHeader eyebrow="SQL explorer" title="Every chart, traceable to a query"
        text="The exact SQL behind the dashboard — CTEs, joins, window functions — with live result previews that respond to the filters." />
      <FilterBar scope={SCOPE} />
      <Gate state={state}>
        {(d) => (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search queries or SQL…" aria-label="Search queries" className="h-9 w-64 rounded-xl border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-600" /></label>
              {feats.map((f) => <button key={f} onClick={() => setFeat(feat === f ? null : f)} className={cn("rounded-full px-3 py-1 text-xs font-semibold transition", feat === f ? "bg-forest-900 text-white" : "bg-white text-ink-2 ring-1 ring-line hover:ring-emerald-500")}>{f}</button>)}
              <span className="ml-auto text-xs text-ink-3">{items.length} of {d.total} queries</span>
            </div>
            <div className="grid gap-3">{items.map((i: Row) => <QueryCard key={i.id} q={i} />)}</div>
          </div>
        )}
      </Gate>
    </>
  );
}
