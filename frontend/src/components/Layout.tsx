import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Database, FlaskConical, LayoutDashboard, Map as MapIcon, Menu, ShieldCheck, TrendingUp, Trophy, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useFilters } from "../context/Filters";
import { useStations } from "./FilterBar";
import Mascot from "./Mascot";
import { cn } from "./ui";

export const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/rankings", label: "Area Ranking", icon: Trophy },
  { to: "/dashboard/trends", label: "Historical Trends", icon: TrendingUp },
  { to: "/dashboard/seasonal", label: "Monthly & Hourly", icon: CalendarClock },
  { to: "/dashboard/pollutants", label: "Pollutants", icon: FlaskConical },
  { to: "/dashboard/map", label: "Pollution Map", icon: MapIcon },
  { to: "/dashboard/data-quality", label: "Data Quality", icon: ShieldCheck },
  { to: "/dashboard/sql", label: "SQL Explorer", icon: Database },
];

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Bengaluru Air Quality Intelligence – home">
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl", dark ? "bg-white/10" : "bg-forest-900")}>
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden><path d="M9 21a4.2 4.2 0 0 1 .8-8.3A5.7 5.7 0 0 1 20.7 11 4.7 4.7 0 0 1 23.5 21z" fill="#e9f7ef" /><circle cx="14" cy="16.5" r="1.1" fill="#0c3a2b" /><circle cx="18.6" cy="16.5" r="1.1" fill="#0c3a2b" /></svg>
      </span>
      <span className={cn("font-display text-[17px] font-semibold leading-none", dark ? "text-white" : "text-ink")}>
        Bengaluru AQI<span className={cn("block text-[10px] font-sans font-semibold uppercase tracking-[.16em]", dark ? "text-emerald-400" : "text-emerald-600")}>Intelligence System</span>
      </span>
    </Link>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Dashboard sections">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate}
          className={({ isActive }) => cn("group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
            isActive ? "text-white" : "text-emerald-100/70 hover:bg-white/5 hover:text-white")}>
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/15" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
              <Icon size={18} className={cn("relative", isActive && "text-emerald-400")} /><span className="relative">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-8 p-5">
      <Logo dark />
      <SideNav onNavigate={onNavigate} />
      <div className="mt-auto rounded-2xl glass-dark p-4 text-center text-xs text-emerald-100/80">
        <div className="flex justify-center"><Mascot mood="good" size={84} /></div>
        <p className="mt-1">Hi, I'm Nimbus. I change mood with the air you're looking at.</p>
        <p className="mt-2 text-[11px] text-emerald-100/50">Source: OpenCity.in datasets</p>
      </div>
    </div>
  );
}

export function DatasetSwitch() {
  const { filters, set } = useFilters();
  const { meta } = useStations();
  if (!meta) return null;
  const active = meta.dataset as "real" | "demo";
  const opts = [{ v: "real", label: "Real data", ok: meta.has_real }, { v: "demo", label: "Demo", ok: meta.has_demo }];
  return (
    <div className="flex items-center gap-2">
      {meta.is_demo && (
        <span className="hidden items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold tracking-wide text-amber-900 sm:inline-flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />DEMO DATA
        </span>
      )}
      {meta.has_real && meta.has_demo && (
        <div className="inline-flex rounded-xl bg-paper-2 p-0.5 text-xs font-semibold" role="group" aria-label="Dataset">
          {opts.map((o) => (
            <button key={o.v} disabled={!o.ok} onClick={() => set({ dataset: o.v as "real" | "demo", stations: [] })}
              className={cn("rounded-[10px] px-2.5 py-1.5 transition", active === o.v ? "bg-white text-forest-900 shadow-sm" : "text-ink-3 hover:text-ink")}
              aria-pressed={active === o.v}>{o.label}</button>
          ))}
        </div>
      )}
      <span className="hidden text-xs text-ink-3 md:inline">{filters.dataset === "auto" ? "auto" : "pinned"}</span>
    </div>
  );
}

export default function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { meta } = useStations();
  const current = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label ?? "Dashboard";
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-gradient-to-b from-forest-900 to-forest-950 lg:block"><SidebarBody /></aside>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-forest-950/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-forest-900 to-forest-950 lg:hidden" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", damping: 30, stiffness: 320 }}>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-2 text-white/70"><X size={18} /></button>
              <SidebarBody onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur-md sm:px-8 lg:static lg:h-16 lg:bg-transparent lg:backdrop-blur-0">
        <button className="rounded-lg p-2 hover:bg-paper-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
        <div className="font-display text-lg font-semibold lg:text-base lg:font-medium lg:text-ink-3">{current}</div>
        <div className="ml-auto"><DatasetSwitch /></div>
      </header>
      {meta?.is_demo && (
        <div className="mx-4 mb-0 mt-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:mx-8" role="note">
          <strong>DEMO DATA</strong> — synthetic sample for UI testing, not real measurements. Upload an OpenCity file on the Data Quality page to analyse real records; demo and real data are never mixed.
        </div>
      )}
      <main className="px-4 pb-16 pt-4 sm:px-8"><PageTransition><Outlet /></PageTransition></main>
    </div>
  );
}

function PageTransition({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div key={loc.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
