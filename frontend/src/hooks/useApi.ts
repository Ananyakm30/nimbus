import { useCallback, useEffect, useRef, useState } from "react";
import { get, qs, type Row } from "../lib/api";
import { useFilters, type Scope } from "../context/Filters";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Fetch `path`; keeps the previous data on screen while a new request loads (smooth chart transitions). */
export function useApi<T = Row>(path: string | null, refreshKey: unknown = 0) {
  const [state, setState] = useState<State<T>>({ data: null, loading: !!path, error: null });
  const seq = useRef(0);

  const load = useCallback(() => {
    if (!path) return;
    const ctrl = new AbortController();
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    get<T>(path, ctrl.signal)
      .then((data) => id === seq.current && setState({ data, loading: false, error: null }))
      .catch((e) => {
        if (e.name === "AbortError" || id !== seq.current) return;
        setState((s) => ({ ...s, loading: false, error: e.message || "Request failed" }));
      });
    return () => ctrl.abort();
  }, [path]);

  useEffect(() => load(), [load, refreshKey]);
  return { ...state, reload: load };
}

/** Query-string for the global filters, restricted to the filters a page actually supports. */
export function useScopeQuery(scope: Scope, extra: Record<string, unknown> = {}) {
  const { filters } = useFilters();
  const q: Record<string, unknown> = { dataset: filters.dataset === "auto" ? undefined : filters.dataset, ...extra };
  if (scope.includes("year")) q.year = filters.year;
  if (scope.includes("month")) q.month = filters.month;
  if (scope.includes("stations")) q.station_id = filters.stations;
  if (scope.includes("dates")) {
    q.date_from = filters.dateFrom;
    q.date_to = filters.dateTo;
  }
  return qs(q);
}

export function useScopedApi<T = Row>(base: string, scope: Scope, extra: Record<string, unknown> = {}) {
  const { refreshKey } = useFilters();
  const query = useScopeQuery(scope, extra);
  return useApi<T>(base + query, refreshKey);
}
