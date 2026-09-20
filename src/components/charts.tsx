"use client";

const PRIMARY = "#6d28d9";
const PINK = "#e86aa6";
const GRID = "#eef0f4";
const MUTED = "#9ca3af";
const INK = "#17181a";

function yTicks(max: number) {
  return [1, 0.66, 0.33, 0].map((f) => Math.round(max * f));
}

function niceMax(values: number[]): number {
  const max = Math.max(...values);
  return Number.isFinite(max) && max > 0 ? max : 1;
}

export function BarChart({
  data,
  highlight = -1,
}: {
  data: { label: string; value: number }[];
  highlight?: number;
}) {
  const W = 620;
  const H = 230;
  const padL = 40;
  const padT = 22;
  const padB = 34;
  const max = niceMax(data.map((d) => d.value));
  const innerW = W - padL - 8;
  const innerH = H - padT - padB;
  const step = innerW / data.length;
  const barW = Math.min(step * 0.55, 46);
  const y = (v: number) => padT + innerH * (1 - Math.min(v, max) / max);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Bar chart">
      {yTicks(max).map((tick, i) => (
        <g key={i}>
          <line x1={padL} x2={W - 4} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth="1" strokeDasharray="3 5" />
          <text x={padL - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{tick}%</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = padL + step * i + step / 2;
        const color = i === highlight ? PINK : PRIMARY;
        return (
          <g key={d.label}>
            <rect x={cx - barW / 2} y={y(d.value)} width={barW} height={innerH + padT - y(d.value) + 2} rx="5" fill={color} />
            <text x={cx} y={y(d.value) - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill={color}>{d.value}%</text>
            <text x={cx} y={H - 12} textAnchor="middle" fontSize="12" fill={MUTED}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({
  points,
  unit = "%",
}: {
  points: { label: string; value: number }[];
  unit?: string;
}) {
  const W = 620;
  const H = 250;
  const padL = 40;
  const padT = 20;
  const padB = 34;
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const range = max - min || 1;
  const innerW = W - padL - 8;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (innerW * i) / (points.length - 1);
  const y = (v: number) => padT + innerH * (1 - (v - min) / range);

  const linePath = points.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p.value)}`).join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1)} ${H - padB} L ${x(0)} ${H - padB} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Line chart">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.22" />
          <stop offset="100%" stopColor={PRIMARY} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const v = min + range * f;
        return (
          <g key={f}>
            <line x1={padL} x2={W - 4} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{Math.round(v)}{unit}</text>
          </g>
        );
      })}
      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={linePath} fill="none" stroke={PRIMARY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.label}>
          {i === points.length - 1 ? (
            <circle cx={x(i)} cy={y(p.value)} r="6" fill={PRIMARY} />
          ) : (
            <circle cx={x(i)} cy={y(p.value)} r="4" fill={PRIMARY} stroke="#fff" strokeWidth="2" />
          )}
          <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="12" fill={MUTED}>{p.label}</text>
          <text x={x(i)} y={y(p.value) - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill={INK}>{p.value}{unit}</text>
        </g>
      ))}
    </svg>
  );
}

export function DonutChart({
  segments,
  centerTop,
  centerBottom,
}: {
  segments: { label: string; value: number; color: string }[];
  centerTop: string;
  centerBottom: string;
}) {
  const size = 210;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 74;
  const strokeWidth = 22;
  const C = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const segmentsWithOffset = segments.map((s, i) => {
    const len = (s.value / total) * C;
    const dashOffset = -segments.slice(0, i).reduce((sum, x) => sum + (x.value / total) * C, 0);
    return { ...s, len, dashOffset };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="chart-svg" role="img" aria-label="Donut chart">
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke={GRID} strokeWidth={strokeWidth} />
      {segmentsWithOffset.map((s) => (
        <circle
          key={s.label}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={s.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${Math.max(s.len - 3, 0)} ${C}`}
          strokeDashoffset={s.dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeLinecap="butt"
        />
      ))}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="26" fontWeight="700" fill={INK}>{centerTop}</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="11.5" fill={MUTED}>{centerBottom}</text>
    </svg>
  );
}