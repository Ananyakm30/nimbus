import { motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import { ArrowRight, BarChart3, Building2, CalendarClock, Car, Database, ExternalLink, Factory, FlaskConical, Map as MapIcon, Menu, ShieldCheck, Sparkles, Trees, TrendingUp, Trophy, Wind, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Particles, Skyline, WindLines } from "../components/Illustrations";
import { Logo } from "../components/Layout";
import Mascot from "../components/Mascot";
import { Counter } from "../components/ui";
import { useApi } from "../hooks/useApi";
import type { Row } from "../lib/api";
import { catColor, categoryOf, moodOf } from "../lib/aqi";

const fade = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
const Reveal = ({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) => (
  <motion.div variants={fade} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} transition={{ delay }} className={className}>{children}</motion.div>
);

function Nav() {
  const [open, setOpen] = useState(false);
  const links = [["Why it matters", "#why"], ["Features", "#features"], ["Preview", "#preview"], ["Data", "#data"]];
  return (
    <header className="glass fixed inset-x-0 top-0 z-50 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-semibold text-ink-2 md:flex" aria-label="Main">
          {links.map(([l, h]) => <a key={h} href={h} className="transition hover:text-emerald-600">{l}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/dashboard" className="hidden rounded-xl bg-forest-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-800 sm:inline-block">Open dashboard</Link>
          <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-1 border-t border-line px-5 py-3 md:hidden">
          {links.map(([l, h]) => <a key={h} href={h} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2 text-sm font-semibold">{l}</a>)}
          <Link to="/dashboard" className="mt-1 rounded-xl bg-forest-900 px-4 py-2.5 text-center text-sm font-semibold text-white">Open dashboard</Link>
        </div>
      )}
    </header>
  );
}

/** Station field: real stations (with dataset coordinates) when data exists; otherwise a clearly-labelled illustration. */
function HeroViz() {
  const { data } = useApi<Row>("/api/air-quality/map");
  const stations: Row[] = (data?.stations ?? []).filter((s: Row) => s.latitude != null);
  const real = stations.length > 0;
  const demo = data?.meta?.is_demo;
  const lat = stations.map((s) => s.latitude), lon = stations.map((s) => s.longitude);
  const [a, b, c, d] = [Math.min(...lat), Math.max(...lat), Math.min(...lon), Math.max(...lon)];
  const pts = real
    ? stations.map((s) => ({ key: s.station_id, name: s.name, x: 12 + ((s.longitude - c) / (d - c || 1)) * 76, y: 88 - ((s.latitude - a) / (b - a || 1)) * 76, aqi: s.avg_aqi, color: catColor(s.category) }))
    : [[22, 30], [48, 22], [70, 38], [35, 58], [60, 64], [80, 72], [18, 76]].map(([x, y], i) => ({ key: i, name: "", x, y, aqi: null, color: "#5ccb9b" }));
  const avg = real ? stations.reduce((s, r) => s + r.avg_aqi, 0) / stations.length : null;

  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[28px] bg-gradient-to-br from-forest-800 to-forest-950 shadow-[var(--shadow-lift)] ring-1 ring-white/20">
      <div className="grid-lines absolute inset-0" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        <path d="M0 62 C 20 55, 30 70, 52 60 S 85 48, 100 56" stroke="#5ccb9b" strokeOpacity=".25" strokeWidth=".6" fill="none" />
        <path d="M0 30 C 25 38, 40 22, 62 30 S 90 40, 100 28" stroke="#5ccb9b" strokeOpacity=".18" strokeWidth=".6" fill="none" />
      </svg>
      {pts.map((p, i) => (
        <div key={p.key} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          <motion.span className="absolute -inset-3 rounded-full" style={{ background: p.color }} animate={{ scale: [0.6, 2.2], opacity: [0.5, 0] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.35 }} />
          <span className="relative block h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: p.color }} />
          {p.name && <span title={p.name} className={`absolute left-4 top-[-3px] whitespace-nowrap text-[10px] font-semibold text-white/85 ${i % 2 ? "hidden sm:inline" : ""}`}>{p.name.split(" ")[0]} {p.aqi != null && <b className="ml-0.5 text-white">{Math.round(p.aqi)}</b>}</span>}
        </div>
      ))}
      <div className="absolute left-4 top-4 rounded-2xl bg-white/12 p-3 text-white backdrop-blur">
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">{real ? (demo ? "Demo data · avg AQI" : "Average AQI") : "Bengaluru"}</p>
        <p className="font-display text-4xl font-semibold leading-none"><Counter value={avg} decimals={0} /></p>
        <p className="mt-1 text-xs text-white/70">{avg != null ? categoryOf(avg)?.name : "Load data to see live values"}</p>
      </div>
      <div className="absolute bottom-3 right-3"><Mascot mood={avg != null ? moodOf(avg) : "good"} size={96} /></div>
      <p className="absolute bottom-3 left-4 text-[10px] text-white/55">{real ? (demo ? "Synthetic DEMO stations" : "Stations from your dataset") : "Illustrative preview — no data loaded yet"}</p>
    </div>
  );
}

function Hero() {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 }), sy = useSpring(my, { stiffness: 60, damping: 20 });
  const { scrollY } = useScroll();
  const lift = useTransform(scrollY, [0, 600], [0, -80]);
  const layerX = (k: number) => useTransform(sx, (v) => v * k);
  const layerY = (k: number) => useTransform(sy, (v) => v * k);
  const x1 = layerX(14), y1 = layerY(10), x2 = layerX(-22), y2 = layerY(-14);
  return (
    <section className="hero-bg relative overflow-hidden pt-28" onMouseMove={(e) => { mx.set(e.clientX / window.innerWidth - 0.5); my.set(e.clientY / window.innerHeight - 0.5); }}>
      <Particles count={26} />
      <motion.div style={{ x: x2, y: y2 }} className="pointer-events-none absolute -left-10 top-24 w-96 opacity-60"><WindLines /></motion.div>
      <motion.div style={{ x: x1, y: y1 }} className="pointer-events-none absolute right-[-60px] top-[40%] w-[420px] opacity-50"><WindLines stroke="#1a6b4e" /></motion.div>
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-28 lg:grid-cols-[1.05fr_1fr]">
        <motion.div style={{ y: lift }}>
          <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[.14em] text-forest-800 ring-1 ring-line">
            <Sparkles size={13} className="text-emerald-600" />Bengaluru Air Quality Intelligence
          </motion.span>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.7 }} className="mt-5 text-5xl font-semibold leading-[1.02] text-forest-950 sm:text-6xl lg:text-7xl">
            Understand the Air <span className="italic text-emerald-600">You Breathe.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }} className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
            Turn years of scattered monitoring-station records into clear answers: which neighbourhoods are most polluted, when the air turns bad, which pollutants drive it — and how far you can trust the data.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.7 }} className="mt-9 flex flex-wrap items-center gap-4">
            <Link to="/dashboard" className="group inline-flex items-center gap-2.5 rounded-2xl bg-forest-900 px-7 py-4 text-base font-semibold text-white shadow-[0_12px_30px_-10px_rgb(12_58_43/0.6)] transition hover:bg-forest-800">
              Explore Bengaluru's Air Quality<ArrowRight size={18} className="transition group-hover:translate-x-1" />
            </Link>
            <a href="#features" className="px-2 py-3 text-sm font-semibold text-forest-800 underline-offset-4 hover:underline">What's inside</a>
          </motion.div>
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-2">
            {["SQL-driven analytics", "Transparent data cleaning", "No fabricated results"].map((t) => <span key={t} className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-600" />{t}</span>)}
          </div>
        </motion.div>
        <motion.div style={{ x: x1, y: y1 }} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.8 }}>
          <HeroViz />
        </motion.div>
      </div>
      <Skyline className="absolute inset-x-0 bottom-0 h-28 w-full opacity-90" />
    </section>
  );
}

const WHY = [
  { icon: Car, title: "Traffic & urban growth", text: "Vehicle emissions concentrate around junctions and corridors, pushing NO₂ and fine particles up at rush hour." },
  { icon: Factory, title: "Industry", text: "Industrial belts release particulates and SO₂ that travel well beyond their fence-lines." },
  { icon: Building2, title: "Construction & dust", text: "Earthworks and road dust lift coarse PM10, especially through the dry months." },
  { icon: Trees, title: "Health & liveability", text: "Long exposure to fine particles affects lungs and hearts — and quietly shapes where people choose to live." },
];

const FEATURES = [
  { icon: BarChart3, title: "Analytics dashboard", text: "KPIs with period-over-period change, category mix and a filterable monthly timeline.", to: "/dashboard" },
  { icon: Trophy, title: "Area-wise ranking", text: "Stations ranked with SQL window functions against the city average.", to: "/dashboard/rankings" },
  { icon: TrendingUp, title: "Historical trends", text: "Year-over-year AQI, improving vs deteriorating stations, multi-station comparison.", to: "/dashboard/trends" },
  { icon: CalendarClock, title: "Monthly & hourly", text: "Seasonality heatmaps, peak pollution hours and weekday patterns.", to: "/dashboard/seasonal" },
  { icon: FlaskConical, title: "Pollutant analysis", text: "PM2.5, PM10, NO₂, SO₂ — only what your dataset actually contains.", to: "/dashboard/pollutants" },
  { icon: MapIcon, title: "Pollution map", text: "Station markers by AQI category with latest readings and history.", to: "/dashboard/map" },
  { icon: ShieldCheck, title: "Data quality", text: "Upload CSV/Excel, run the pipeline, and see every record accounted for.", to: "/dashboard/data-quality" },
  { icon: Database, title: "SQL explorer", text: "Read the exact query behind every chart, with live previews.", to: "/dashboard/sql" },
];

function Preview() {
  const bars = Array.from({ length: 28 }, (_, i) => 30 + Math.abs(Math.sin(i * 0.55) * 44) + (i % 5) * 3);
  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/15 bg-forest-950 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.6)]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">{["#ff6b6b", "#f7c948", "#5ccb9b"].map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}<span className="ml-3 text-xs text-white/40">dashboard · layout preview</span></div>
      <div className="grid grid-cols-[120px_1fr] sm:grid-cols-[170px_1fr]">
        <div className="space-y-2 border-r border-white/10 p-4">{Array.from({ length: 7 }).map((_, i) => <div key={i} className={`h-7 rounded-lg ${i === 0 ? "bg-white/15" : "bg-white/5"}`} />)}</div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="rounded-2xl bg-white/6 p-3"><div className="h-2 w-10 rounded bg-white/25" /><div className="mt-3 h-6 w-16 rounded bg-emerald-400/70" /><div className="mt-2 h-1.5 w-12 rounded bg-white/15" /></div>)}</div>
          <div className="rounded-2xl bg-white/6 p-4">
            <div className="flex h-36 items-end gap-1">{bars.map((h, i) => <motion.div key={i} className="flex-1 rounded-t bg-gradient-to-t from-emerald-600 to-emerald-300" initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ delay: i * 0.025, duration: 0.6 }} />)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="overflow-x-clip">
      <Nav />
      <Hero />

      <section id="overview" className="mx-auto max-w-7xl px-5 py-24">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">The project</p>
          <h2 className="mt-2 text-4xl font-semibold sm:text-5xl">From scattered spreadsheets to decisions</h2>
          <p className="mt-5 text-lg text-ink-2">Monitoring records live in different files, with gaps, duplicates, mismatched timestamps and varying intervals. This system cleans them transparently, stores them in a relational database, and answers questions with SQL — so every number on screen is traceable.</p>
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[["Collect", "OpenCity CSV / Excel", Wind], ["Clean", "Pandas pipeline", Sparkles], ["Store", "Relational SQL", Database], ["Query", "CTEs & windows", BarChart3], ["Explore", "Interactive dashboard", MapIcon]].map(([t, s, Icon], i) => {
            const I = Icon as typeof Wind;
            return (
              <Reveal key={t as string} delay={i * 0.08}>
                <div className="card relative h-full p-5 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><I size={22} /></span>
                  <p className="mt-3 font-display text-xl font-semibold">{t as string}</p><p className="text-sm text-ink-3">{s as string}</p>
                  {i < 4 && <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-paper p-1 text-emerald-600 lg:block" size={24} />}</div>
              </Reveal>
            );
          })}
        </div>
      </section>

      <section id="why" className="dark-section relative overflow-hidden py-24">
        <Particles count={18} color="#5ccb9b" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-[360px_1fr]">
          <Reveal className="text-center lg:text-left">
            <div className="flex justify-center lg:justify-start"><Mascot mood="poor" size={170} /></div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-emerald-400">Why air quality matters</p>
            <h2 className="mt-2 text-4xl font-semibold text-white sm:text-5xl">A growing city, a shared atmosphere</h2>
            <p className="mt-4 text-emerald-100/75">Bengaluru's urbanisation brings more vehicles, industry and construction. Understanding where and when pollution peaks is the first step to reducing exposure.</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {WHY.map((w, i) => (
              <Reveal key={w.title} delay={i * 0.08}>
                <div className="glass-dark h-full rounded-3xl p-6 transition hover:bg-white/10"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300"><w.icon size={22} /></span>
                  <h3 className="mt-4 text-xl font-semibold text-white">{w.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-emerald-100/70">{w.text}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
        <Skyline tone="dark" className="absolute inset-x-0 bottom-0 h-20 w-full opacity-60" />
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-24">
        <Reveal className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">Key analytical features</p><h2 className="mt-2 text-4xl font-semibold sm:text-5xl">Eight lenses on the same air</h2></Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 0.07}>
              <Link to={f.to} className="card group block h-full p-5 transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 transition group-hover:bg-forest-900 group-hover:text-white"><f.icon size={21} /></span>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3><p className="mt-1 text-sm leading-relaxed text-ink-2">{f.text}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">Open<ArrowRight size={14} className="transition group-hover:translate-x-1" /></span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="preview" className="dark-section py-24">
        <div className="mx-auto max-w-7xl px-5">
          <Reveal className="mx-auto mb-12 max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-400">Dashboard preview</p><h2 className="mt-2 text-4xl font-semibold text-white sm:text-5xl">Built for exploring, not just looking</h2>
            <p className="mt-3 text-emerald-100/70">Global filters, drill-down into raw readings, CSV export on every table. The frame below is a layout illustration — it carries no real values.</p></Reveal>
          <Reveal><Preview /></Reveal>
        </div>
      </section>

      <section id="data" className="mx-auto max-w-7xl px-5 py-24">
        <div className="card grid items-center gap-8 p-8 sm:p-12 lg:grid-cols-[1fr_auto]">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-600">Data source</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Bring your OpenCity dataset</h2>
            <p className="mt-3 max-w-2xl text-ink-2">Historical Bengaluru air-quality files are published on OpenCity. Download a CSV or Excel file and upload it on the Data Quality page — column names are detected automatically, missing pollutants are tolerated, and raw rows are always preserved. Until you do, the app can show a clearly-labelled <b>DEMO</b> sample that is synthetic and never mixed with real records.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="https://opencity.in/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:border-emerald-600">OpenCity.in<ExternalLink size={14} /></a>
              <Link to="/dashboard/data-quality" className="inline-flex items-center gap-2 rounded-xl bg-forest-900 px-4 py-2.5 text-sm font-semibold text-white">Upload a dataset<ArrowRight size={14} /></Link>
            </div>
          </Reveal>
          <div className="hidden lg:block"><Mascot mood="good" size={200} /></div>
        </div>
      </section>

      <footer className="border-t border-line bg-paper-2/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-ink-3">
          <Logo />
          <p>Air-quality categories follow the CPCB National AQI. Data courtesy of OpenCity.in; demo data is synthetic.</p>
          <Link to="/dashboard" className="font-semibold text-forest-800 hover:underline">Open dashboard →</Link>
        </div>
      </footer>
    </div>
  );
}
