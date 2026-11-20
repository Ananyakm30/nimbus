import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type FilterKey = "year" | "month" | "stations" | "dates" | "pollutant";
export type Scope = readonly FilterKey[];

export interface Filters {
  dataset: "auto" | "real" | "demo";
  year?: number;
  month?: number;
  stations: number[];
  dateFrom?: string;
  dateTo?: string;
}

interface Ctx {
  filters: Filters;
  set: (patch: Partial<Filters>) => void;
  reset: () => void;
  /** bump to make every scoped request refetch (e.g. after an upload) */
  refreshKey: number;
  refresh: () => void;
}

const initial: Filters = { dataset: "auto", stations: [] };
const FilterCtx = createContext<Ctx | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Filters>(initial);
  const [refreshKey, setKey] = useState(0);
  const set = useCallback((p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p })), []);
  const reset = useCallback(() => setFilters((f) => ({ ...initial, dataset: f.dataset })), []);
  const refresh = useCallback(() => setKey((k) => k + 1), []);
  const value = useMemo(() => ({ filters, set, reset, refreshKey, refresh }), [filters, set, reset, refreshKey, refresh]);
  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>;
}

export function useFilters() {
  const c = useContext(FilterCtx);
  if (!c) throw new Error("useFilters outside provider");
  return c;
}
