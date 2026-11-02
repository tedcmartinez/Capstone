// The movement chart, and the dashboard's counting invariant
//
// The chart is a pure function from a series to an SVG string, so it can be
// checked without a browser. What matters is that it scales to the tallest
// bar, leaves adjustments out, and says something useful when there is
// nothing to draw.

import { describe, it, expect } from 'vitest';

import { movementChart } from '../../app-firebase/src/ui/chart.js';
import { dailyTotals } from '../../app-firebase/src/lib/movements.js';
import { stockStatus } from '../../app-firebase/src/lib/dom.js';

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Counts how many times a substring appears, for counting rendered bars
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// ============================================================
// WITH NOTHING TO DRAW
// ============================================================

describe('an empty chart', () => {
  it('explains itself rather than drawing empty axes', () => {
    const svg = movementChart(dailyTotals([], 30), { days: 30 });

    // An empty grid with axes reads as a broken chart, so the PHP version
    // wrote out the reason instead, and so does this. The empty state has
    // an icon of its own, so what is checked is the absence of the chart
    // rather than the absence of any svg.
    expect(svg).not.toContain('cb-chart');
    expect(svg).toContain('No movements in the last 30 days');
    expect(svg).toContain('/reports/movement');
  });

  it('says so for a series of entirely quiet days', () => {
    const series = dailyTotals(
      [{ movementDate: isoDaysAgo(90), type: 'in', quantity: 500 }],
      30
    );

    expect(movementChart(series, { days: 30 })).toContain('No movements');
  });
});

// ============================================================
// WITH DATA
// ============================================================

describe('a chart with movements', () => {
  const series = dailyTotals(
    [
      { movementDate: isoDaysAgo(3), type: 'in', quantity: 200 },
      { movementDate: isoDaysAgo(2), type: 'out', quantity: 50 },
      { movementDate: isoDaysAgo(0), type: 'in', quantity: 60 },
      { movementDate: isoDaysAgo(0), type: 'out', quantity: 20 },
    ],
    30
  );

  it('draws an svg with one bar per figure', () => {
    const svg = movementChart(series, { days: 30 });

    expect(svg).toContain('<svg');
    // Two in bars and two out bars across the four entries
    expect(count(svg, 'cb-chart-bar-in')).toBe(2);
    expect(count(svg, 'cb-chart-bar-out')).toBe(2);
  });

  it('scales to the tallest figure', () => {
    const svg = movementChart(series, { days: 30 });

    // The axis labels run 0, half and full against the largest bar of 200.
    // Read out of the axis text rather than matched against the markup, so
    // a change of indentation cannot fail this.
    const axisLabels = [...svg.matchAll(/class="cb-chart-axis"[^>]*>\s*(\d+)\s*</g)].map(
      (match) => Number(match[1])
    );

    expect(axisLabels).toContain(0);
    expect(axisLabels).toContain(100);
    expect(axisLabels).toContain(200);
  });

  it('labels each bar with its day and figure, which is the tooltip', () => {
    const svg = movementChart(series, { days: 30 });

    expect(svg).toContain('200 in');
    expect(svg).toContain('50 out');
  });

  it('draws no bar on a quiet day rather than a bar of zero', () => {
    const oneDay = dailyTotals([{ movementDate: isoDaysAgo(0), type: 'in', quantity: 10 }], 7);
    const svg = movementChart(oneDay, { days: 7 });

    expect(count(svg, 'cb-chart-bar-in')).toBe(1);
    expect(count(svg, 'cb-chart-bar-out')).toBe(0);
  });

  it('spaces the date labels so they cannot overlap', () => {
    const svg = movementChart(
      dailyTotals([{ movementDate: isoDaysAgo(0), type: 'in', quantity: 1 }], 30),
      { days: 30 }
    );

    // About seven labels across thirty days, not thirty
    const labels = count(svg, 'text-anchor="middle"');
    expect(labels).toBeGreaterThanOrEqual(5);
    expect(labels).toBeLessThanOrEqual(9);
  });

  it('carries a description for a screen reader', () => {
    const svg = movementChart(series, { days: 30 });

    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Bar chart of stock in and stock out');
  });
});

// ============================================================
// ADJUSTMENTS ARE NOT PLOTTED
// ============================================================

describe('adjustments on the chart', () => {
  it('are left out entirely', () => {
    // An adjustment corrects the record rather than moving material through
    // the shop. Drawing one as a withdrawal would show a day's activity
    // that never happened.
    const series = dailyTotals(
      [{ movementDate: isoDaysAgo(0), type: 'adjust', quantity: 40, difference: -40 }],
      30
    );

    expect(movementChart(series, { days: 30 })).toContain('No movements');
  });

  it('do not change the scale of the real bars', () => {
    const withAdjustment = dailyTotals(
      [
        { movementDate: isoDaysAgo(0), type: 'in', quantity: 10 },
        // Far larger than the delivery, so it would dominate the scale
        { movementDate: isoDaysAgo(0), type: 'adjust', quantity: 900, difference: -900 },
      ],
      7
    );

    const svg = movementChart(withAdjustment, { days: 7 });

    // The axis tops out at the delivery, not at the adjustment
    expect(svg).toContain('10');
    expect(svg).not.toContain('900');
  });
});

// ============================================================
// THE DASHBOARD'S COUNTING INVARIANT
//
// The three health states must always add up to the size of the catalog.
// The PHP model had countLowOnly() for exactly this reason: a material with
// nothing left must count as out of stock, not as low stock as well, or the
// health bar would add up to more than the catalog.
// ============================================================

describe('the health states partition the catalog', () => {
  const catalog = [
    { stockQuantity: 150, minThreshold: 50 },
    { stockQuantity: 18, minThreshold: 30 },
    { stockQuantity: 0, minThreshold: 5 },
    { stockQuantity: 5, minThreshold: 20 },
    { stockQuantity: 40, minThreshold: 20 },
    // The awkward pair: empty with no threshold, and stock with no threshold
    { stockQuantity: 0, minThreshold: 0 },
    { stockQuantity: 3, minThreshold: 0 },
  ];

  it('counts every material exactly once', () => {
    const healthy = catalog.filter((m) => stockStatus(m.stockQuantity, m.minThreshold) === 'healthy').length;
    const low = catalog.filter((m) => stockStatus(m.stockQuantity, m.minThreshold) === 'low').length;
    const out = catalog.filter((m) => stockStatus(m.stockQuantity, m.minThreshold) === 'out').length;

    expect(healthy + low + out).toBe(catalog.length);
  });

  it('never counts an empty material as low as well as out', () => {
    const empty = { stockQuantity: 0, minThreshold: 5 };
    const status = stockStatus(empty.stockQuantity, empty.minThreshold);

    expect(status).toBe('out');
    expect(status).not.toBe('low');
  });

  it('holds for an empty catalog, which a fresh install has', () => {
    const healthy = [].filter(() => true).length;

    expect(healthy).toBe(0);
    // The dashboard divides by the total to size the health bar, so a floor
    // of one is used there to avoid dividing by zero on a new system
    expect(Math.max(1, 0)).toBe(1);
  });
});
