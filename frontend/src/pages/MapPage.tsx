import L from "leaflet";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import FilterBar from "../components/FilterBar";
import Gate from "../components/Gate";
import { AqiBadge, Card, PageHeader, cn } from "../components/ui";
import type { Scope } from "../context/Filters";
import { useScopedApi } from "../hooks/useApi";
import type { Row } from "../lib/api";
import { catColor, CATEGORIES, fmt, PLABEL, ymLabel } from "../lib/aqi";

const SCOPE: Scope = ["year", "month", "dates"];

function icon(aqi: number, cat: string) {
  const c = catColor(cat);
  return L.divIcon({
    className: "", iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -16],
    html: `<div class="marker-wrap"><span class="marker-pulse" style="background:${c}55"></span><span class="marker-core" style="background:${c}">${Math.round(aqi)}</span></div>`,
  });
}

function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useMemo(() => { if (pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 13 }); }, [pts.map((p) => p.join()).join("|")]); // eslint-disable-line
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useMemo(() => { if (target) map.flyTo(target, 13, { duration: 0.8 }); }, [target?.join()]); // eslint-disable-line
  return null;
}

function StationPopup({ s }: { s: Row }) {
  return (
    <div className="w-64">
      <p className="font-display text-lg font-semibold leading-tight">{s.name}</p>
      <p className="text-xs text-ink-3">{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)} · {s.coordinate_source}</p>
      <div className="mt-2 flex items-center justify-between"><div><p className="text-[11px] uppercase tracking-wide text-ink-3">Average AQI</p><p className="font-display text-3xl font-semibold" style={{ color: catColor(s.category) }}>{fmt(s.avg_aqi, 1)}</p></div><AqiBadge category={s.category} /></div>
      <p className="mt-1 text-xs text-ink-2">Latest: <b>{fmt(s.latest_aqi, 0)}</b> AQI on {String(s.latest_ts).slice(0, 16).replace("T", " ")}</p>
      <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
        {(["pm25", "pm10", "no2", "so2"] as const).map((p) => (
          <div key={p} className="rounded-lg bg-paper p-1"><p className="text-ink-3">{PLABEL[p]}</p><p className="font-bold">{s[`avg_${p}`] == null ? "n/a" : fmt(s[`avg_${p}`], 0)}</p></div>
        ))}
      </div>
      {s.history.length > 1 && (
        <div className="mt-2 h-16"><ResponsiveContainer><AreaChart data={s.history}><XAxis dataKey="ym" hide /><Tooltip labelFormatter={(l) => ymLabel(Number(l))} formatter={(v: number) => [fmt(v, 1), "Avg AQI"]} />
          <Area dataKey="avg_aqi" stroke={catColor(s.category)} fill={catColor(s.category)} fillOpacity={0.25} strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
      )}
      <p className="text-[10px] text-ink-3">Monthly AQI, last {s.history.length} months</p>
    </div>
  );
}

export default function MapPage() {
  const state = useScopedApi<Row>("/api/air-quality/map", SCOPE);
  const [hide, setHide] = useState<string[]>([]);
  const [focus, setFocus] = useState<number | null>(null);

  return (
    <>
      <PageHeader eyebrow="Bengaluru pollution map" title="Where is the air worst?"
        text="Each marker is a monitoring station, coloured by its average AQI. Coordinates come from the dataset only — none are guessed." />
      <FilterBar scope={SCOPE} />
      <Gate state={state}>
        {(d) => {
          const st: Row[] = d.stations.filter((s: Row) => s.latitude != null);
          const pts = st.map((s) => [s.latitude, s.longitude] as [number, number]);
          const shown = st.filter((s) => !hide.includes(s.category));
          return (
            <div className="space-y-4">
              {d.note && (
                <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
                  <AlertTriangle className="shrink-0" size={18} /><div><b>Geospatial data incomplete.</b> {d.note} Mapped: {d.mapped} · without coordinates: {d.unmapped}
                    {d.unmapped > 0 && <> ({d.stations.filter((s: Row) => s.latitude == null).map((s: Row) => s.name).join(", ")})</>}. Add Latitude/Longitude columns to your upload to place them.</div>
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                <Card className="relative h-[560px] overflow-hidden p-1.5">
                  {pts.length === 0 ? (
                    <div className="grid h-full place-items-center p-8 text-center text-ink-2">No station in this dataset has coordinates, so nothing can be plotted.</div>
                  ) : (
                    <MapContainer center={pts[0]} zoom={11} className="h-full w-full" scrollWheelZoom>
                      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Fit pts={pts} />
                      <FlyTo target={(() => { const f = st.find((s) => s.station_id === focus); return f ? [f.latitude, f.longitude] : null; })()} />
                      {shown.map((s) => (
                        <Marker key={s.station_id} position={[s.latitude, s.longitude]} icon={icon(s.avg_aqi, s.category)} eventHandlers={{ click: () => setFocus(s.station_id) }}>
                          <Popup minWidth={260}><StationPopup s={s} /></Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  )}
                  <div className="glass absolute bottom-4 left-4 z-[500] rounded-2xl p-3 text-xs shadow-lg">
                    <p className="mb-1.5 font-bold text-ink-2">Legend · click to filter</p>
                    {CATEGORIES.map((c) => (
                      <button key={c.name} onClick={() => setHide((h) => (h.includes(c.name) ? h.filter((x) => x !== c.name) : [...h, c.name]))}
                        className={cn("flex w-full items-center gap-2 py-0.5 text-left transition", hide.includes(c.name) && "opacity-35")}>
                        <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.name}<span className="ml-auto pl-3 text-ink-3">≤{c.max}</span>
                      </button>
                    ))}
                  </div>
                </Card>
                <Card className="max-h-[560px] overflow-auto p-3">
                  <p className="px-2 pb-2 pt-1 text-sm font-semibold text-ink-2">Stations by average AQI</p>
                  <ul className="space-y-1">
                    {d.stations.map((s: Row) => (
                      <li key={s.station_id}>
                        <button disabled={s.latitude == null} onClick={() => setFocus(s.station_id)}
                          className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-paper", focus === s.station_id && "bg-emerald-50", s.latitude == null && "opacity-50")}>
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: catColor(s.category) }}>{Math.round(s.avg_aqi)}</span>
                          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{s.name}</span><span className="text-xs text-ink-3">{s.latitude == null ? "no coordinates" : s.category}</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          );
        }}
      </Gate>
    </>
  );
}
