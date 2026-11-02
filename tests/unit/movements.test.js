// Movement logic
//
// The arithmetic and the summaries, tested without a network. The write
// itself is covered by tests/integration/movements-flow.test.js, where the
// security rules get to refuse it.

import { describe, it, expect } from 'vitest';

import {
  allowedReasons,
  reasonLabel,
  movementTotals,
  dailyTotals,
  daysAgoIso,
  sortMovementsInPage,
  validateMovement,
  movementTypeLabel,
} from '../../app-firebase/src/lib/movements.js';

const material = { id: 'm1', name: 'Mahogany Plank', unit: 'pcs', stockQuantity: 18 };

// ============================================================
// REASONS
// The exact lists the old forms offered, so wording in existing records
// still matches what a new record can say.
// ============================================================

describe('allowedReasons', () => {
  it('offers the stock-in reasons from the LAN version', () => {
    expect(allowedReasons('in')).toEqual(['Purchase', 'Restock', 'Return', 'Correction']);
  });

  it('offers the stock-out reasons from the LAN version', () => {
    expect(allowedReasons('out')).toEqual(['Project Usage', 'Damaged', 'Transfer', 'Other']);
  });

  it('shows Correction as "Stock Correction", as the old dropdown did', () => {
    expect(reasonLabel('Correction')).toBe('Stock Correction');
    expect(reasonLabel('Purchase')).toBe('Purchase');
  });

  it('offers its own reasons for an adjustment, none of them optional', () => {
    const reasons = allowedReasons('adjust');

    expect(reasons).toContain('Physical Count');
    expect(reasons).toContain('Damage Found');
    // Not mixed up with the stock-in or stock-out lists
    expect(reasons).not.toContain('Purchase');
    expect(reasons).not.toContain('Project Usage');
  });
});

describe('movementTypeLabel', () => {
  it('labels all three kinds of movement', () => {
    expect(movementTypeLabel('in')).toBe('IN');
    expect(movementTypeLabel('out')).toBe('OUT');
    expect(movementTypeLabel('adjust')).toBe('ADJUST');
  });
});

// ============================================================
// VALIDATION
// Ported from MovementController::logMovement().
// ============================================================

describe('validateMovement', () => {
  it('requires a material', () => {
    const errors = validateMovement({ materialId: '', quantity: '5', type: 'in' });

    expect(errors).toContain('Please select a material.');
  });

  it('requires a whole quantity greater than zero', () => {
    const base = { materialId: 'm1', type: 'in', hasReceipt: true };

    expect(validateMovement({ ...base, quantity: '0' })).toContain(
      'Quantity must be a whole number greater than zero.'
    );
    expect(validateMovement({ ...base, quantity: '-3' })).toHaveLength(1);
    expect(validateMovement({ ...base, quantity: '2.5' })).toHaveLength(1);
    expect(validateMovement({ ...base, quantity: '' })).toHaveLength(1);
    expect(validateMovement({ ...base, quantity: 'abc' })).toHaveLength(1);
  });

  it('accepts a valid stock-in', () => {
    expect(
      validateMovement({ materialId: 'm1', quantity: '50', type: 'in', material, hasReceipt: true })
    ).toEqual([]);
  });

  // ---- 12. Stock out greater than on hand is blocked ----

  it('12. refuses a stock-out larger than the stock on hand', () => {
    const errors = validateMovement({
      materialId: 'm1',
      quantity: '25',
      type: 'out',
      material,
    });

    expect(errors).toContain('Cannot remove more than the 18 pcs currently in stock.');
  });

  it('12. allows a stock-out of exactly the stock on hand', () => {
    expect(
      validateMovement({
        materialId: 'm1',
        quantity: '18',
        type: 'out',
        material,
        reason: 'Project Usage',
        project: 'Sofa set',
      })
    ).toEqual([]);
  });

  it('12. does not cap a stock-in, since receiving adds stock', () => {
    expect(
      validateMovement({ materialId: 'm1', quantity: '9999', type: 'in', material, hasReceipt: true })
    ).toEqual([]);
  });

  it('12. refuses any stock-out from an empty material', () => {
    const empty = { ...material, stockQuantity: 0 };
    const errors = validateMovement({ materialId: 'm1', quantity: '1', type: 'out', material: empty });

    expect(errors).toContain('Cannot remove more than the 0 pcs currently in stock.');
  });
});

// ============================================================
// TOTALS
// ============================================================

describe('movementTotals', () => {
  const movements = [
    { type: 'in', quantity: 200 },
    { type: 'out', quantity: 50 },
    { type: 'in', quantity: 60 },
    { type: 'out', quantity: 20 },
  ];

  it('adds up what came in and what went out', () => {
    const totals = movementTotals(movements);

    expect(totals.totalIn).toBe(260);
    expect(totals.totalOut).toBe(70);
    expect(totals.net).toBe(190);
  });

  it('gives a negative net when more left than arrived', () => {
    expect(movementTotals([{ type: 'out', quantity: 30 }]).net).toBe(-30);
  });

  it('returns zeros for an empty list', () => {
    expect(movementTotals([])).toEqual({
      totalIn: 0,
      totalOut: 0,
      adjustedUp: 0,
      adjustedDown: 0,
      adjustmentCount: 0,
      net: 0,
    });
  });

  // ---- Adjustments ----

  it('counts an adjustment by the direction it moved the total', () => {
    const totals = movementTotals([
      { type: 'in', quantity: 50 },
      { type: 'out', quantity: 20 },
      { type: 'adjust', quantity: 3, difference: -3 },
      { type: 'adjust', quantity: 7, difference: 7 },
    ]);

    // Kept apart from deliveries and withdrawals, because an adjustment is
    // neither and adding it to either would misrepresent both
    expect(totals.totalIn).toBe(50);
    expect(totals.totalOut).toBe(20);
    expect(totals.adjustedUp).toBe(7);
    expect(totals.adjustedDown).toBe(3);
    expect(totals.adjustmentCount).toBe(2);

    // The net still describes what happened to the stock overall
    expect(totals.net).toBe(50 - 20 + 7 - 3);
  });

  it('reports no adjustments when there are none', () => {
    const totals = movementTotals([{ type: 'in', quantity: 5 }]);

    expect(totals.adjustmentCount).toBe(0);
    expect(totals.adjustedUp).toBe(0);
    expect(totals.adjustedDown).toBe(0);
  });
});

// ============================================================
// THE CHART SERIES
// Ported from getDailyTotals(), which filled in quiet days so the chart
// shows an even timeline instead of skipping dates.
// ============================================================

describe('dailyTotals', () => {
  // Builds a YYYY-MM-DD string for N days ago, matching how movementDate
  // is stored
  function isoDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  it('returns one entry per day, including days with no activity', () => {
    const series = dailyTotals([{ movementDate: isoDaysAgo(2), type: 'in', quantity: 10 }], 7);

    expect(series).toHaveLength(7);
    expect(series.filter((day) => day.in === 0 && day.out === 0)).toHaveLength(6);
  });

  it('ends on today and runs forward in time', () => {
    const series = dailyTotals([], 30);

    expect(series[series.length - 1].date).toBe(isoDaysAgo(0));
    expect(series[0].date).toBe(isoDaysAgo(29));
  });

  it('adds several movements on the same day together', () => {
    const today = isoDaysAgo(0);
    const series = dailyTotals(
      [
        { movementDate: today, type: 'in', quantity: 10 },
        { movementDate: today, type: 'in', quantity: 5 },
        { movementDate: today, type: 'out', quantity: 3 },
      ],
      7
    );

    const last = series[series.length - 1];
    expect(last.in).toBe(15);
    expect(last.out).toBe(3);
  });

  it('ignores movements older than the window', () => {
    const series = dailyTotals([{ movementDate: isoDaysAgo(60), type: 'in', quantity: 99 }], 30);

    expect(series.every((day) => day.in === 0)).toBe(true);
  });

  it('leaves adjustments off the chart entirely', () => {
    // An adjustment corrects the record rather than moving material through
    // the shop, so charting it would invent activity that never happened.
    const series = dailyTotals(
      [{ movementDate: isoDaysAgo(0), type: 'adjust', quantity: 3, difference: -3 }],
      7
    );

    expect(series.every((day) => day.in === 0 && day.out === 0)).toBe(true);
  });

  it('asks for a start date matching the window it will fill', () => {
    const series = dailyTotals([], 30);

    expect(daysAgoIso(30)).toBe(series[0].date);
  });
});

// ============================================================
// SORTING WITHIN A PAGE
// ============================================================

describe('sortMovementsInPage', () => {
  const rows = [
    { materialName: 'Mahogany Plank', type: 'out', quantity: 32, movementDate: '2026-06-15', loggedByName: 'Staff' },
    { materialName: 'Foam Padding Roll', type: 'in', quantity: 15, movementDate: '2026-06-04', loggedByName: 'Admin' },
    { materialName: 'Steel Angle Bar', type: 'out', quantity: 20, movementDate: '2026-06-20', loggedByName: 'Staff' },
  ];

  it('sorts by material name', () => {
    expect(sortMovementsInPage(rows, 'materialName', 'asc')[0].materialName)
      .toBe('Foam Padding Roll');
  });

  it('sorts quantity numerically', () => {
    expect(sortMovementsInPage(rows, 'quantity', 'asc').map((r) => r.quantity))
      .toEqual([15, 20, 32]);
  });

  it('sorts by date, newest first when descending', () => {
    expect(sortMovementsInPage(rows, 'movementDate', 'desc')[0].movementDate)
      .toBe('2026-06-20');
  });

  it('sorts by who logged it', () => {
    expect(sortMovementsInPage(rows, 'loggedByName', 'asc')[0].loggedByName).toBe('Admin');
  });

  it('falls back to the date when the key is not recognised', () => {
    expect(sortMovementsInPage(rows, 'nonsense', 'desc')[0].movementDate).toBe('2026-06-20');
  });

  it('does not modify the list it was given', () => {
    const before = rows.map((r) => r.materialName);
    sortMovementsInPage(rows, 'quantity', 'desc');

    expect(rows.map((r) => r.materialName)).toEqual(before);
  });
});
