import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useFilters } from "../context/Filters";
import { send, type Row } from "../lib/api";
import { EmptyState, ErrorState, LoadingMascot, Skeleton } from "./ui";

export function LoadDemoButton() {
  const { refresh } = useFilters();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try { await send("POST", "/api/data/demo"); refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2.5">
        <Link to="/dashboard/data-quality" className="rounded-xl bg-forest-900 px-4 py-2.5 text-sm font-semibold text-white">Upload an OpenCity file</Link>
        <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:border-emerald-600 disabled:opacity-60">
          {busy && <Loader2 size={15} className="animate-spin" />}{busy ? "Processing ~106k rows… (about a minute)" : "Load labelled DEMO data"}
        </button>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}

export function NoData() {
  return (
    <EmptyState title="No air quality data yet" mood="moderate" action={<LoadDemoButton />}
      text="Nimbus has nothing to read. Upload a CSV or Excel file downloaded from OpenCity, or load the clearly-labelled synthetic DEMO sample to explore the interface." />
  );
}

/** Wraps a page section: skeleton while loading, error with retry, and the friendly empty state. */
export default function Gate<T extends Row>({ state, children, skeleton }: {
  state: { data: T | null; loading: boolean; error: string | null; reload: () => void };
  children: (d: T) => ReactNode; skeleton?: ReactNode;
}) {
  const { data, loading, error, reload } = state;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return skeleton ?? (
    <div className="space-y-4"><LoadingMascot /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div></div>
  );
  const empty = data.has_data === false || data.meta?.has_data === false;
  if (empty) return <NoData />;
  return (
    <>
      {error && <div className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800">Refresh failed: {error}</div>}
      <div className={loading ? "opacity-70 transition-opacity" : "transition-opacity"}>{children(data)}</div>
    </>
  );
}
