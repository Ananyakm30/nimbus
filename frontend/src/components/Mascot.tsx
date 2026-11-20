import { motion } from "framer-motion";
import type { Mood } from "../lib/aqi";

const BODY: Record<Mood, { fill: string; stroke: string }> = {
  good: { fill: "#ffffff", stroke: "#cfe8da" },
  moderate: { fill: "#dfe3e0", stroke: "#bcc5c0" },
  poor: { fill: "#8f9a94", stroke: "#6f7b75" },
};

/** "Nimbus" - the air-quality cloud. Original SVG; expression and tone follow the AQI mood. */
export default function Mascot({ mood = "good", size = 120, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const c = BODY[mood];
  const dark = mood === "poor" ? "#2b3631" : "#12261f";
  return (
    <motion.svg
      viewBox="0 0 120 100" width={size} height={(size * 100) / 120} className={className} role="img"
      aria-label={`Air quality mascot looking ${mood === "good" ? "happy" : mood === "moderate" ? "unsure" : "unwell"}`}
      animate={{ y: [0, -5, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <ellipse cx="60" cy="92" rx="26" ry="3.5" fill="#12261f" opacity=".1" />
      <g fill={c.fill} stroke={c.stroke} strokeWidth="2">
        <circle cx="38" cy="54" r="19" />
        <circle cx="62" cy="40" r="25" />
        <circle cx="86" cy="55" r="18" />
        <rect x="38" y="54" width="48" height="22" rx="11" />
      </g>
      <g fill={c.fill}>
        <circle cx="38" cy="54" r="17.5" /><circle cx="62" cy="40" r="23.5" /><circle cx="86" cy="55" r="16.5" />
        <rect x="39" y="55" width="46" height="20" rx="10" />
      </g>
      {mood === "good" && <g fill="#f6b8b8" opacity=".7"><ellipse cx="46" cy="64" rx="5" ry="3" /><ellipse cx="78" cy="64" rx="5" ry="3" /></g>}
      {[52, 72].map((x) => (
        <motion.ellipse key={x} cx={x} cy={57} rx={3.2} ry={mood === "poor" ? 2.2 : 3.6} fill={dark}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          animate={{ scaleY: [1, 1, 0.1, 1, 1] }} transition={{ duration: 5, repeat: Infinity, times: [0, 0.46, 0.5, 0.54, 1] }} />
      ))}
      {mood === "poor" && <g stroke={dark} strokeWidth="2" strokeLinecap="round"><path d="M47 49l9 3" /><path d="M77 49l-9 3" /></g>}
      <path
        d={mood === "good" ? "M54 66q8 8 16 0" : mood === "moderate" ? "M55 68h14" : "M54 71q4-5 8-2t8 2"}
        fill="none" stroke={dark} strokeWidth="2.4" strokeLinecap="round"
      />
      {mood === "poor" && (
        <g fill="#6f7b75">
          {[[28, 22, 5], [92, 18, 4], [100, 36, 3]].map(([x, y, r], i) => (
            <motion.circle key={i} cx={x} cy={y} r={r} initial={{ y: 0, opacity: 0.2 }} animate={{ y: [0, -8, 0], opacity: [0.2, 0.8, 0.2] }}
              transition={{ duration: 3 + i, repeat: Infinity, delay: i * 0.5 }} />
          ))}
        </g>
      )}
    </motion.svg>
  );
}
