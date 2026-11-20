import { animate, motion, useInView } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Download, Minus, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { catColor, categoryOf, type Mood } from "../lib/aqi";
import { downloadCsv } from "../lib/csv";
import Mascot from "./Mascot";

export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function Counter({ value, decimals = 0, className }: { value: number | null | undefined; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const prev = useRef(0);
  useEffect(() => {
    if (value == null || !ref.current || !inView) return;
    const el = ref.current;
    const show = (v: number) => { el.textContent = v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); };
    const c = animate(prev.current, value, {
      duration: 1.1, ease: "easeOut", onUpdate: show,
      onComplete: () => { prev.current = value; show(value); },
    });
    return () => c.stop();
  }, [value, decimals, inView]);
  return <span ref={ref} className={className}>{value == null ? "—" : (0).toFixed(decimals)}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function Card({ children, className, hover = false }: { children: ReactNode; className?: string; hover?: boolean }) {
  return (
    <motion.div className={cn("card", className)} whileHover={hover ? { y: -3, boxShadow: "var(--shadow-lift)" } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}>
      {children}
    </motion.div>
  );
}

export function Panel({ title, subtitle, actions, children, className, loading, insights }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string; loading?: boolean; insights?: string[];
}) {
  return (
    <motion.section className={cn("card flex flex-col p-5", className)} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45 }}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className={cn("relative min-h-0 flex-1 transition-opacity", loading && "opacity-60")}>{children}</div>
      {insights && insights.length > 0 && <InsightList items={insights} />}
    </motion.section>
  );
}

export function InsightList({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2 rounded-xl bg-emerald-50 p-3.5 text-sm text-forest-900">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 leading-snug"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />{t}</li>
      ))}
    </ul>
  );
}

export function ChangeChip({ pct, invert = true, label }: { pct: number | null | undefined; invert?: boolean; label?: string }) {
  if (pct == null) return <span className="text-xs text-ink-3">No earlier period to compare</span>;
  const up = pct > 0.05, down = pct < -0.05;
  const good = invert ? down : up; // for AQI lower is better
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
      !up && !down ? "bg-paper-2 text-ink-2" : good ? "bg-emerald-100 text-forest-800" : "bg-red-100 text-red-800")}>
      <Icon size={13} />{Math.abs(pct).toFixed(1)}%{label && <span className="font-normal opacity-70">&nbsp;{label}</span>}
    </span>
  );
}

export function KpiCard({ icon: Icon, label, value, decimals = 0, suffix, hint, change, invert = true, changeLabel, accent, loading }: {
  icon: LucideIcon; label: string; value: number | null | undefined; decimals?: number; suffix?: string; hint: string;
  change?: number | null; invert?: boolean; changeLabel?: string; accent?: string; loading?: boolean;
}) {
  return (
    <Card hover className="relative overflow-hidden p-5">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[.12]" style={{ background: accent ?? "#1f9d6b" }} />
      <div className="flex items-center gap-2.5 text-sm font-medium text-ink-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600" style={accent ? { background: accent + "22", color: accent } : undefined}><Icon size={18} /></span>
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        {loading ? <Skeleton className="h-9 w-24" /> : <Counter value={value} decimals={decimals} className="font-display text-4xl font-semibold tabular-nums" />}
        {suffix && <span className="text-sm text-ink-3">{suffix}</span>}
      </div>
      <p className="mt-1 text-xs leading-snug text-ink-3">{hint}</p>
      <div className="mt-3"><ChangeChip pct={change} invert={invert} label={changeLabel} /></div>
    </Card>
  );
}

export function AqiBadge({ aqi, category, className }: { aqi?: number | null; category?: string; className?: string }) {
  const name = category ?? categoryOf(aqi)?.name;
  if (!name) return <span className="text-ink-3">—</span>;
  const col = catColor(name);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", className)} style={{ background: col + "22", color: col }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: col }} />{name}
    </span>
  );
}

export function EmptyState({ title, text, mood = "good", action }: { title: string; text: string; mood?: Mood; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Mascot mood={mood} size={130} />
      <h3 className="mt-3 text-xl font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-2">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
      <Mascot mood="poor" size={90} />
      <p className="font-semibold text-red-900">Couldn't load this data</p>
      <p className="max-w-lg text-sm text-red-800">{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-1 rounded-lg bg-red-900 px-3 py-1.5 text-sm font-semibold text-white">Try again</button>}
    </div>
  );
}

export function LoadingMascot({ label = "Reading the air…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16" role="status">
      <Mascot mood="moderate" size={100} />
      <p className="mt-2 text-sm text-ink-3">{label}</p>
    </div>
  );
}

export function ExportButton({ rows, name }: { rows: Record<string, unknown>[] | undefined; name: string }) {
  return (
    <button onClick={() => rows && downloadCsv(name, rows)} disabled={!rows?.length}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-2 transition hover:border-emerald-600 hover:text-forest-800 disabled:opacity-40">
      <Download size={14} />CSV
    </button>
  );
}

export function PageHeader({ eyebrow, title, text, right }: { eyebrow: string; title: string; text: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-600">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-ink-2">{text}</p>
      </div>
      {right}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-paper-2 p-1" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("relative rounded-lg px-3 py-1.5 text-sm font-semibold transition", value === o.value ? "text-forest-900" : "text-ink-3 hover:text-ink")}>
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-lg bg-white shadow-sm" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function NoDataLink() {
  return <Link to="/dashboard/data-quality" className="rounded-xl bg-forest-900 px-4 py-2 text-sm font-semibold text-white">Open Data Quality to load data</Link>;
}

export function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
