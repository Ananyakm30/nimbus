const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface Meta {
  dataset: "real" | "demo";
  is_demo: boolean;
  has_real: boolean;
  has_demo: boolean;
  has_data: boolean;
  demo_notice: string | null;
}

async function parse(res: Response) {
  if (res.ok) return res.json();
  let msg = res.statusText;
  try {
    const j = await res.json();
    msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
  } catch {
    /* non-JSON body */
  }
  throw new ApiError(res.status, msg);
}

export async function get<T = Row>(path: string, signal?: AbortSignal): Promise<T> {
  return parse(await fetch(BASE + path, { signal }));
}

export async function send<T = Row>(method: string, path: string, body?: FormData): Promise<T> {
  return parse(await fetch(BASE + path, { method, body }));
}

export function qs(params: Record<string, unknown>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, String(x)));
    else u.append(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}
