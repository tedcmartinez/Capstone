// The movement chart
//
// A port of the inline SVG the PHP dashboard drew. It stays hand-drawn SVG
// rather than becoming a charting library, for the reason the original
// comment gave: the system needs no chart library and keeps working with no
// connection. On the free plan that also matters because a library would be
// another few hundred kilobytes for the shop desktop to fetch.
//
// Two bars per day, stock in beside stock out. Adjustments are deliberately
// not plotted: they correct the record rather than moving material through
// the shop, so drawing one as a withdrawal would show activity that never
// happened.

import { esc, shortDate } from '../lib/dom.js';

// The same geometry the PHP version used, so the chart is the shape it was
const WIDTH = 720;
const HEIGHT = 200;
const PAD_LEFT = 38; // room for the value labels
const PAD_BOTTOM = 24; // room for the date labels
const PLOT_W = WIDTH - PAD_LEFT - 10;
const PLOT_H = HEIGHT - PAD_BOTTOM - 8;

export function movementChart(series, { days }) {
  // The tallest bar sets the scale. A floor of one avoids dividing by zero
  // when nothing has moved at all.
  let max = 1;
  let hasData = false;

  for (const point of series) {
    max = Math.max(max, point.in, point.out);
    if (point.in > 0 || point.out > 0) hasData = true;
  }

  if (!hasData) return emptyChart(days);

  const slotW = PLOT_W / Math.max(1, series.length);
  // Two bars side by side in each day's slot
  const barW = Math.min(11, (slotW - 6) / 2);

  // About seven date labels however many days are shown, so they never
  // overlap each other
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  return `
    <svg class="cb-chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" role="img"
         aria-label="Bar chart of stock in and stock out quantities for the last ${days} days">
      ${gridLines(max)}
      ${series.map((point, index) => daySlot(point, index, { slotW, barW, max, labelEvery })).join('')}
    </svg>`;
}

// Horizontal lines at nothing, half and full scale, with their values
function gridLines(max) {
  return [0, 0.5, 1]
    .map((tick) => {
      const y = 8 + PLOT_H - PLOT_H * tick;
      return `
        <line class="cb-chart-grid" x1="${PAD_LEFT}" y1="${y}" x2="${WIDTH - 10}" y2="${y}"></line>
        <text class="cb-chart-axis" x="${PAD_LEFT - 6}" y="${y + 3}" text-anchor="end">
          ${Math.round(max * tick)}
        </text>`;
    })
    .join('');
}

function daySlot(point, index, { slotW, barW, max, labelEvery }) {
  const slotX = PAD_LEFT + index * slotW;
  const groupX = slotX + (slotW - (barW * 2 + 3)) / 2;

  const inHeight = (point.in / max) * PLOT_H;
  const outHeight = (point.out / max) * PLOT_H;

  const round = (value) => Math.round(value * 10) / 10;

  // A title on each bar is the tooltip. It is what makes the chart
  // readable without a library: hovering a bar names the day and the figure.
  const inBar =
    point.in > 0
      ? `<rect class="cb-chart-bar-in" x="${round(groupX)}" y="${round(8 + PLOT_H - inHeight)}"
              width="${round(barW)}" height="${round(inHeight)}" rx="2">
           <title>${esc(shortDate(point.date))}: ${point.in} in</title>
         </rect>`
      : '';

  const outBar =
    point.out > 0
      ? `<rect class="cb-chart-bar-out" x="${round(groupX + barW + 3)}" y="${round(8 + PLOT_H - outHeight)}"
              width="${round(barW)}" height="${round(outHeight)}" rx="2">
           <title>${esc(shortDate(point.date))}: ${point.out} out</title>
         </rect>`
      : '';

  const label =
    index % labelEvery === 0
      ? `<text class="cb-chart-axis" x="${round(slotX + slotW / 2)}" y="${HEIGHT - 6}" text-anchor="middle">
           ${esc(monthDay(point.date))}
         </text>`
      : '';

  return inBar + outBar + label;
}

// "Aug 21", the short form the axis uses
function monthDay(iso) {
  const parts = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return iso;

  const date = new Date(+parts[1], +parts[2] - 1, +parts[3]);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// An empty grid with axes would look like a broken chart, so the reason is
// written out instead. The PHP version did the same.
function emptyChart(days) {
  return `
    <div class="cb-empty">
      <div class="cb-empty-icon">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M4 11H2v3h2zm5-4H7v7h2zm5-5v12h-2V2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/></svg>
      </div>
      <div class="cb-empty-title">No movements in the last ${days} days</div>
      <p class="cb-empty-text">
        Log a stock in or stock out and it will appear here.
        <a href="/reports/movement" class="cb-link">See the full movement report</a>
      </p>
    </div>`;
}
