/**
 * One small, reusable chart: an inline SVG line/area sparkline. It exists because the Town Hall
 * dashboard is the first place in the game that needed a trend graph at all — nothing here is
 * specific to resources, production or population, so every history strip in the dashboard (and
 * anything that wants one later) should render through this rather than growing its own SVG code.
 *
 * Deliberately minimal: one series, a filled area under it, an optional zero line, and a `<title>`
 * per point for a tap/hover tooltip. That covers every trend the dashboard shows — a resource's
 * stock, a category's seasonal production, the population count — without a charting library.
 */

export interface ChartPoint {
  /** Shown in the point's tooltip, e.g. "Spring Y1". */
  label: string;
  value: number;
}

export interface ChartOptions {
  width?: number;
  height?: number;
  /** Stroke/fill colour — defaults to the theme's accent green via `currentColor`. */
  color?: string;
  /** Format a value for its tooltip. Defaults to a rounded plain number. */
  formatValue?: (v: number) => string;
}

/**
 * Render `points` (oldest first) as a compact SVG line chart with a soft fill underneath. Returns
 * a ready-to-inline `<svg>…</svg>` string — the caller drops it straight into `innerHTML`.
 *
 * Fewer than two points draws a flat placeholder line rather than nothing, so a brand-new village
 * (one season of books, or none) shows an empty chart rather than a layout hole.
 */
export function sparklineSVG(points: ChartPoint[], opts: ChartOptions = {}): string {
  const w = opts.width ?? 220;
  const h = opts.height ?? 46;
  const pad = 3;
  const fmt = opts.formatValue ?? ((v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toString());
  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const n = Math.max(points.length, 2);
  const x = (i: number) => pad + (i / (n - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const pts = points.length > 0 ? points : [{ label: '', value: 0 }, { label: '', value: 0 }];
  const coords = pts.map((p, i) => [x(i), y(p.value)] as const);
  const line = coords.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const zeroY = y(0).toFixed(1);
  const area =
    `${coords.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')} ${x(pts.length - 1).toFixed(1)},${zeroY} ${x(0).toFixed(1)},${zeroY}`;
  const color = opts.color ?? 'currentColor';
  const dots = pts
    .map((p, i) => {
      const [px, py] = coords[i];
      return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.4" fill="${color}"><title>${escapeXml(p.label)}: ${escapeXml(fmt(p.value))}</title></circle>`;
    })
    .join('');
  // The zero line only means anything when the series actually crosses it (a resource that only
  // ever gains, or only ever spends, has nothing to gain from a baseline sitting on its own axis).
  const zeroLine = min < 0 && max > 0
    ? `<line x1="${pad}" y1="${zeroY}" x2="${w - pad}" y2="${zeroY}" stroke="${color}" stroke-opacity="0.25" stroke-width="1" stroke-dasharray="2,2" />`
    : '';
  return (
    `<svg class="th-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="${w}" height="${h}">` +
    `<polygon points="${area}" fill="${color}" fill-opacity="0.16" stroke="none" />` +
    zeroLine +
    `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />` +
    dots +
    `</svg>`
  );
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
