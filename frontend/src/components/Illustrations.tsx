import { motion } from "framer-motion";
import { useMemo } from "react";

/** Floating particles (pollution motes / pollen). Deterministic positions, CSS-animated for cheap rendering. */
export function Particles({ count = 24, color = "#2db37c", className = "" }: { count?: number; color?: string; className?: string }) {
  const items = useMemo(() => Array.from({ length: count }, (_, i) => {
    const r = (n: number) => { const x = Math.sin(i * 97.13 + n * 31.7) * 10000; return x - Math.floor(x); };
    return { left: r(1) * 100, top: 30 + r(2) * 70, size: 3 + r(3) * 7, dur: 7 + r(4) * 9, delay: -r(5) * 12, dx: (r(6) - 0.2) * 120, dy: -(60 + r(7) * 160), o: 0.25 + r(8) * 0.4 };
  }), [count]);
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {items.map((p, i) => (
        <span key={i} className="particle" style={{
          left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, background: color, opacity: p.o,
          ["--dur" as string]: `${p.dur}s`, ["--delay" as string]: `${p.delay}s`, ["--dx" as string]: `${p.dx}px`, ["--dy" as string]: `${p.dy}px`,
        }} />
      ))}
    </div>
  );
}

export function WindLines({ className = "", stroke = "#2db37c" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 400 120" className={className} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path className="wind-line" d="M10 30h220c30 0 40-24 14-26" opacity=".7" />
      <path className="wind-line" style={{ animationDelay: "-1s" }} d="M40 62h280c34 0 44 28 16 30" opacity=".55" />
      <path className="wind-line" style={{ animationDelay: "-2s" }} d="M0 96h180c26 0 32-18 10-20" opacity=".4" />
    </svg>
  );
}

function Tree({ x, h = 40, c = "#1f9d6b" }: { x: number; h?: number; c?: string }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="-2" y={-h * 0.35} width="4" height={h * 0.35} fill="#6b4f3a" />
      <motion.g style={{ transformOrigin: `0px ${-h * 0.3}px` }} animate={{ rotate: [-1.5, 1.5, -1.5] }}
        transition={{ duration: 5 + (x % 3), repeat: Infinity, ease: "easeInOut" }}>
        <circle cx="0" cy={-h * 0.62} r={h * 0.3} fill={c} />
        <circle cx={-h * 0.18} cy={-h * 0.46} r={h * 0.2} fill={c} opacity=".9" />
        <circle cx={h * 0.18} cy={-h * 0.46} r={h * 0.2} fill={c} opacity=".9" />
      </motion.g>
    </g>
  );
}

/** Bengaluru-flavoured skyline: tech-park towers, a factory with drifting smoke, trees and traffic. */
export function Skyline({ className = "", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const b = tone === "dark" ? ["#12503b", "#1a6b4e", "#0f4533"] : ["#cfe3d8", "#b9d6c7", "#a5c8b6"];
  const win = tone === "dark" ? "#5ccb9b" : "#ffffff";
  const blds: [number, number, number, number][] = [[10, 90, 46, 0], [62, 60, 38, 1], [104, 110, 52, 2], [162, 70, 40, 0], [250, 96, 44, 1], [300, 66, 50, 2], [356, 118, 40, 0], [402, 78, 46, 1]];
  return (
    <svg viewBox="0 0 460 160" className={className} preserveAspectRatio="xMidYMax slice" aria-hidden>
      <g transform="translate(0 140)">
        {blds.map(([x, h, w, c], i) => (
          <g key={i}>
            <rect x={x} y={-h} width={w} height={h} rx="3" fill={b[c]} />
            {Array.from({ length: Math.floor(h / 16) }).map((_, r) =>
              Array.from({ length: Math.floor(w / 14) }).map((__, cc) => (
                <rect key={`${r}-${cc}`} x={x + 6 + cc * 12} y={-h + 8 + r * 14} width="5" height="6" rx="1" fill={win} opacity={(r * 7 + cc * 3 + i) % 5 === 0 ? 0.9 : 0.28} />
              )),
            )}
          </g>
        ))}
        {/* factory */}
        <g transform="translate(208 0)">
          <rect x="-4" y="-44" width="40" height="44" fill={b[2]} />
          <rect x="2" y="-84" width="7" height="40" fill={b[1]} />
          <rect x="18" y="-70" width="7" height="26" fill={b[1]} />
          {[0, 1, 2].map((i) => (
            <motion.circle key={i} cx={5.5} cy={-90} r={6} fill="#8f9a94" style={{ transformBox: "fill-box", transformOrigin: "center" }}
              initial={{ x: 0, y: 0, scale: 0.8, opacity: 0.7 }}
              animate={{ x: [0, 25 + i * 6], y: [0, -50], scale: [0.8, 2.4], opacity: [0.7, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, delay: i * 1.5, ease: "easeOut" }} />
          ))}
        </g>
        <rect x="0" y="0" width="460" height="3" fill={tone === "dark" ? "#0a3024" : "#9ab8a8"} />
        <Tree x={28} h={34} /><Tree x={150} h={42} c="#2db37c" /><Tree x={284} h={36} /><Tree x={448} h={40} c="#2db37c" />
        {/* car */}
        <motion.g animate={{ x: [-60, 520] }} transition={{ duration: 14, repeat: Infinity, ease: "linear" }}>
          <rect x="0" y="-12" width="26" height="8" rx="3" fill="#e8832a" />
          <rect x="6" y="-18" width="13" height="8" rx="3" fill="#e8832a" />
          <circle cx="6" cy="-3" r="3" fill="#12261f" /><circle cx="20" cy="-3" r="3" fill="#12261f" />
        </motion.g>
      </g>
    </svg>
  );
}
