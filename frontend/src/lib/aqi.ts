export type Category = "Good" | "Satisfactory" | "Moderate" | "Poor" | "Very Poor" | "Severe";

export const CATEGORIES: { name: Category; max: number; color: string; mood: Mood; blurb: string }[] = [
  { name: "Good", max: 50, color: "#2e9e5b", mood: "good", blurb: "Minimal impact" },
  { name: "Satisfactory", max: 100, color: "#8dbe3f", mood: "good", blurb: "Minor breathing discomfort to sensitive people" },
  { name: "Moderate", max: 200, color: "#e6b422", mood: "moderate", blurb: "Discomfort for people with lung or heart disease" },
  { name: "Poor", max: 300, color: "#e8832a", mood: "poor", blurb: "Discomfort on prolonged exposure" },
  { name: "Very Poor", max: 400, color: "#d64545", mood: "poor", blurb: "Respiratory illness on prolonged exposure" },
  { name: "Severe", max: 500, color: "#8c2f5b", mood: "poor", blurb: "Affects healthy people; serious for the ill" },
];
export type Mood = "good" | "moderate" | "poor";

export function categoryOf(aqi: number | null | undefined) {
  if (aqi == null) return null;
  return CATEGORIES.find((c) => aqi <= c.max) ?? CATEGORIES[CATEGORIES.length - 1];
}
export const colorOf = (aqi: number | null | undefined) => categoryOf(aqi)?.color ?? "#9aa8a1";
export const catColor = (name: string) => CATEGORIES.find((c) => c.name === name)?.color ?? "#9aa8a1";
export const moodOf = (aqi: number | null | undefined): Mood => categoryOf(aqi)?.mood ?? "good";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const PLABEL: Record<string, string> = { pm25: "PM2.5", pm10: "PM10", no2: "NO₂", so2: "SO₂" };
export const PCOLOR: Record<string, string> = { pm25: "#0c3a2b", pm10: "#2db37c", no2: "#e8832a", so2: "#8c6bb1" };
export const SERIES = ["#0c3a2b", "#2db37c", "#e8832a", "#8c6bb1", "#3b82a0", "#d64545", "#b59a2a", "#5b6b64", "#c06c9a"];

export const fmt = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
export const ymLabel = (ym: number) => `${MONTHS[(ym % 100) - 1]} ${Math.floor(ym / 100)}`;
