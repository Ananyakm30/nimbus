import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronDown, Search } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { downloadCsv } from "../lib/csv";
import { cn } from "./ui";
import { Download } from "lucide-react";

export interface Col<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  csv?: (row: T) => unknown;
}

interface Server {
  total: number;
  page: number;
  sort: string;
  dir: "asc" | "desc";
  search: string;
  onPage: (p: number) => void;
  onSort: (key: string, dir: "asc" | "desc") => void;
  onSearch: (s: string) => void;
}

/** Sortable, searchable, paginated table with optional expandable rows. Client-side by default; pass `server` for API-driven paging. */
export default function DataTable<T extends Record<string, any>>({ rows, cols, pageSize = 10, searchKeys, server, expand, onRowClick, exportName, empty = "No rows", highlight, loading }: {
  rows: T[]; cols: Col<T>[]; pageSize?: number; searchKeys?: string[]; server?: Server; expand?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void; exportName?: string; empty?: string; highlight?: (row: T) => string | undefined; loading?: boolean;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [pg, setPg] = useState(1);
  const [open, setOpen] = useState<number | null>(null);

  const view = useMemo(() => {
    if (server) return rows;
    let r = rows;
    if (q && searchKeys) r = r.filter((x) => searchKeys.some((k) => String(x[k] ?? "").toLowerCase().includes(q.toLowerCase())));
    if (sort) r = [...r].sort((a, b) => {
      const [x, y] = [a[sort.key], b[sort.key]];
      if (x == null) return 1; if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * (sort.dir === "asc" ? 1 : -1);
    });
    return r;
  }, [rows, q, sort, searchKeys, server]);

  const total = server ? server.total : view.length;
  const page = server ? server.page : Math.min(pg, Math.max(1, Math.ceil(total / pageSize)));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const shown = server ? view : view.slice((page - 1) * pageSize, page * pageSize);
  const cur = server ? { key: server.sort, dir: server.dir } : sort;
  const toggle = (k: string) => {
    const dir = cur?.key === k && cur.dir === "asc" ? "desc" : "asc";
    server ? server.onSort(k, dir) : setSort({ key: k, dir });
  };
  const go = (p: number) => (server ? server.onPage(p) : setPg(p));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(searchKeys || server) && (
          <label className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={server ? server.search : q} onChange={(e) => { server ? server.onSearch(e.target.value) : (setQ(e.target.value), setPg(1)); }}
              placeholder="Search…" aria-label="Search table" className="h-9 w-56 rounded-xl border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-600" />
          </label>
        )}
        <span className="text-xs text-ink-3">{total.toLocaleString("en-IN")} rows</span>
        {exportName && (
          <button onClick={() => downloadCsv(exportName, rows.map((r) => Object.fromEntries(cols.map((c) => [c.label, c.csv ? c.csv(r) : r[c.key]]))))}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:border-emerald-600"><Download size={14} />Export page</button>
        )}
      </div>
      <div className={cn("scroll-thin overflow-x-auto rounded-xl border border-line transition-opacity", loading && "opacity-60")}>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-paper text-xs uppercase tracking-wide text-ink-3">
            <tr>
              {expand && <th className="w-8" />}
              {cols.map((c) => (
                <th key={c.key} className={cn("px-3.5 py-2.5 font-semibold", c.align === "right" ? "text-right" : "text-left")}>
                  {c.sortable === false ? c.label : (
                    <button onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 uppercase hover:text-ink" aria-label={`Sort by ${c.label}`}>
                      {c.label}{cur?.key === c.key && (cur.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={cols.length + 1} className="px-4 py-8 text-center text-ink-3">{empty}</td></tr>}
            {shown.map((r, i) => (
              <Fragment key={i}>
                <tr className={cn("border-t border-line transition hover:bg-emerald-50/50", onRowClick && "cursor-pointer")} style={{ background: highlight?.(r) }}
                  onClick={() => (expand ? setOpen(open === i ? null : i) : onRowClick?.(r))}>
                  {expand && <td className="pl-3 text-ink-3"><ChevronDown size={14} className={cn("transition", open === i && "rotate-180")} /></td>}
                  {cols.map((c) => (
                    <td key={c.key} className={cn("px-3.5 py-2.5", c.align === "right" && "text-right tabular-nums")}>{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>
                  ))}
                </tr>
                {expand && open === i && <tr className="bg-paper"><td colSpan={cols.length + 1} className="px-5 py-4">{expand(r)}</td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-ink-2">
          <span>Page {page} of {pages}</span>
          <button className="rounded-lg border border-line p-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
          <button className="rounded-lg border border-line p-1.5 disabled:opacity-40" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
