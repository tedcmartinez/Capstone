// Movement History, the Audit Trail and the reports: filters and display
//
// Round 2, part 3. The pieces that decide what is shown, checked without a
// browser or the emulators: date ranges and presets in Philippine time, the
// browser-side movement filter (category, project, keyword), the Sheets
// export rows, the sortable headers, and the small display fixes.

import { describe, it, expect } from 'vitest';

import {
  shopToday,
  presetRange,
  matchingPreset,
  rangeProblem,
  describeRange,
  countHeading,
  startOfShopDay,
  endOfShopDay,
} from '../../app-firebase/src/lib/dates.js';
import { movementMatcher } from '../../app-firebase/src/lib/movements.js';
import {
  movementExportRows,
  movementExportTitle,
  MOVEMENT_EXPORT_HEADER,
} from '../../app-firebase/src/lib/movementExport.js';
import { sortableTh } from '../../app-firebase/src/ui/sort-header.js';
import { reorderBadgeTitle } from '../../app-firebase/src/ui/shell.js';
import { stockChange } from '../../app-firebase/src/pages/movements.js';
import { signedNet } from '../../app-firebase/src/lib/format.js';

// ============================================================
// 3.3 DATE RANGES
// ============================================================

describe('3.3 date presets, counted in Philippine time', () => {
  const today = '2026-11-02';

  it('Today', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-11-02', to: '2026-11-02' });
  });

  it('Last 7 days is today and the six days before it', () => {
    expect(presetRange('last7', today)).toEqual({ from: '2026-10-27', to: '2026-11-02' });
  });

  it('This month runs from the 1st to today', () => {
    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-11-01', to: '2026-11-02' });
  });

  it('Last month is the whole of the month before, across a year end too', () => {
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('lastMonth', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(presetRange('lastMonth', '2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('All time is no dates at all', () => {
    expect(presetRange('all', today)).toEqual({ from: '', to: '' });
  });

  it('recognises which preset a range is, so its button shows as selected', () => {
    expect(matchingPreset('2026-10-27', '2026-11-02', today)).toBe('last7');
    expect(matchingPreset('', '', today)).toBe('all');
    expect(matchingPreset('2026-10-05', '2026-11-02', today)).toBeNull();
  });

  it('uses the Manila date, not the computer clock, near midnight', () => {
    // 4:30 PM UTC on Nov 1 is already 12:30 AM on Nov 2 in Manila
    expect(shopToday(new Date('2026-11-01T16:30:00Z'))).toBe('2026-11-02');
  });
});

describe('3.3 To includes the whole day', () => {
  it('runs from midnight to 11:59:59 PM Philippine time', () => {
    expect(startOfShopDay('2026-11-02').toISOString()).toBe('2026-11-01T16:00:00.000Z');
    expect(endOfShopDay('2026-11-02').toISOString()).toBe('2026-11-02T15:59:59.999Z');
  });
});

describe('3.3 checking a range before it is used', () => {
  it('refuses From after To, with a message, and runs no query', () => {
    expect(rangeProblem('2026-11-05', '2026-11-01')).toMatch(/From date is after the To date/);
  });

  it('accepts a single day, an open end, or no dates', () => {
    expect(rangeProblem('2026-11-02', '2026-11-02')).toBeNull();
    expect(rangeProblem('2026-11-01', '')).toBeNull();
    expect(rangeProblem('', '2026-11-01')).toBeNull();
    expect(rangeProblem('', '')).toBeNull();
  });
});

describe('3.3 the heading shows the active range', () => {
  it('reads like the example in the brief', () => {
    expect(countHeading(42, 'entry', '2026-11-01', '2026-11-02')).toBe('42 entries from Nov 1 to Nov 2, 2026');
  });

  it('handles one day, an open end, a year boundary and all time', () => {
    expect(countHeading(1, 'movement', '2026-11-02', '2026-11-02')).toBe('1 movement on Nov 2, 2026');
    expect(describeRange('2026-12-28', '2027-01-03')).toBe('from Dec 28, 2026 to Jan 3, 2027');
    expect(describeRange('2026-11-01', '')).toBe('since Nov 1, 2026');
    expect(describeRange('', '2026-11-01')).toBe('up to Nov 1, 2026');
    expect(countHeading(3, 'movement', '', '')).toBe('3 movements');
  });
});

// ============================================================
// 3.1 / 3.2 FILTERING MOVEMENTS IN THE BROWSER
// ============================================================

describe('3.1 and 3.2 the browser-side movement filter', () => {
  const movements = [
    { id: 'a', materialId: 'm1', type: 'out', project: 'Sofa set for Ms. Reyes', materialName: 'Mahogany Plank', reason: 'Project Usage' },
    { id: 'b', materialId: 'm2', type: 'out', reference: 'Bed frame', materialName: 'Wood Glue', reason: 'Transfer' },
    { id: 'c', materialId: 'm1', type: 'in', reference: 'PO-1042', materialName: 'Mahogany Plank', reason: 'Purchase', notes: 'late delivery' },
  ];
  const ids = (match) => movements.filter(match).map((m) => m.id);

  it('is skipped entirely when there is nothing for it to check', () => {
    expect(movementMatcher({})).toBeNull();
  });

  it('keeps only the materials in the chosen category', () => {
    expect(ids(movementMatcher({ materialIds: new Set(['m1']) }))).toEqual(['a', 'c']);
  });

  it('matches the project by its start, ignoring case and extra spaces', () => {
    expect(ids(movementMatcher({ project: 'sofa  SET' }))).toEqual(['a']);
  });

  it('finds an older stock-out whose project was saved as its reference', () => {
    expect(ids(movementMatcher({ project: 'bed' }))).toEqual(['b']);
  });

  it('does not treat a stock-in reference as a project', () => {
    expect(ids(movementMatcher({ project: 'PO' }))).toEqual([]);
  });

  it('searches material, reason, project and notes, every word required', () => {
    expect(ids(movementMatcher({ keyword: 'reyes' }))).toEqual(['a']);
    expect(ids(movementMatcher({ keyword: 'mahogany late' }))).toEqual(['c']);
    expect(ids(movementMatcher({ keyword: 'transfer' }))).toEqual(['b']);
  });

  it('combines category, project and keyword', () => {
    expect(ids(movementMatcher({ materialIds: new Set(['m1']), project: 'sofa', keyword: 'plank' }))).toEqual(['a']);
  });
});

// ============================================================
// 3.5 THE SHEETS EXPORT
// ============================================================

describe('3.5 the Movement History export', () => {
  const materialsById = new Map([
    ['m1', { category: 'solid wood', unit: 'pcs' }],
    ['m2', { category: 'adhesives', unit: 'can' }],
  ]);
  const movements = [
    {
      materialId: 'm1',
      materialName: 'Mahogany Plank',
      type: 'out',
      quantity: 4,
      reason: 'Project Usage',
      project: 'Sofa set',
      reference: '',
      notes: 'for the frame',
      loggedByName: 'Juan',
      afterQty: 14,
      createdAt: new Date('2026-11-02T07:04:00Z'),
    },
    { materialId: 'm2', materialName: 'Wood Glue', type: 'out', quantity: 1, reference: 'Bed frame', afterQty: 3 },
  ];

  it('has the columns the brief lists, in order, for staff-level data', () => {
    const [header, first] = movementExportRows(movements, { materialsById });

    expect(header).toEqual([
      'Date and time', 'Type', 'Material', 'Category', 'Quantity', 'Unit', 'Reason',
      'Project', 'Reference', 'Notes', 'Recorded by', 'Stock after',
    ]);
    expect(header).toEqual(MOVEMENT_EXPORT_HEADER);
    expect(first).toEqual([
      'Nov 2, 2026, 3:04 PM', 'Stock Out', 'Mahogany Plank', 'Solid Wood', 4, 'pcs',
      'Project Usage', 'Sofa set', '', 'for the frame', 'Juan', 14,
    ]);
  });

  it('adds Unit cost and Value only when costs are given, for managers', () => {
    const rows = movementExportRows(movements, {
      materialsById,
      costsById: new Map([['m1', { costPerUnit: 220.5 }]]),
    });

    expect(rows[0].slice(-2)).toEqual(['Unit cost', 'Value']);
    expect(rows[1].slice(-2)).toEqual([220.5, 882]);
    // A material with no cost recorded is left blank rather than shown as 0
    expect(rows[2].slice(-2)).toEqual(['', '']);
  });

  it('puts an older stock-out project under Project, and names a deleted user', () => {
    const second = movementExportRows(movements, { materialsById })[2];
    expect(second[7]).toBe('Bed frame');
    expect(second[8]).toBe('');
    expect(second[10]).toBe('Deleted user');
  });

  it('is titled with the range and the export date', () => {
    expect(movementExportTitle('2026-11-01', '2026-11-02', '2026-11-02')).toBe(
      'Cornerblock Movement History – Nov 1 to Nov 2, 2026 – Nov 2, 2026'
    );
    expect(movementExportTitle('', '', '2026-11-02')).toBe('Cornerblock Movement History – All time – Nov 2, 2026');
  });
});

// ============================================================
// 3.4 SORTABLE HEADERS
// ============================================================

describe('3.4 sortable headers', () => {
  const column = { field: 'quantity', label: 'Quantity' };

  it('marks the active column with aria-sort and a solid arrow', () => {
    const asc = sortableTh(column, { field: 'quantity', direction: 'asc' });
    expect(asc).toContain('aria-sort="ascending"');
    expect(asc).toContain('&#9650;');
    expect(asc).not.toContain('is-idle');

    const desc = sortableTh(column, { field: 'quantity', direction: 'desc' });
    expect(desc).toContain('aria-sort="descending"');
    expect(desc).toContain('&#9660;');
  });

  it('shows a faint pair of arrows on a sortable column that is not active', () => {
    const idle = sortableTh(column, { field: 'name', direction: 'asc' });
    expect(idle).toContain('aria-sort="none"');
    expect(idle).toContain('is-idle');
    expect(idle).toContain('&#9650;&#9660;');
  });

  it('stays a real button in the heading cell', () => {
    expect(sortableTh(column, { field: 'name' })).toMatch(/<th[^>]*>\s*<button type="button" class="cb-sort/);
  });
});

// ============================================================
// 3.6 SMALL FIXES
// ============================================================

describe('3.6 small fixes', () => {
  it('shows the stock change as "Stock 4 → 9"', () => {
    expect(stockChange({ type: 'in', beforeQty: 4, afterQty: 9 })).toContain('Stock 4 &rarr; 9');
    // The visible text is just the change; how the figures were recorded is
    // explained in the tooltip
    const visible = stockChange({ type: 'in', beforeQty: 4, afterQty: 9 }).replace(/<[^>]*>/g, '').trim();
    expect(visible).toBe('Stock 4 &rarr; 9');
  });

  it('keeps the adjustment wording, which is exact', () => {
    expect(stockChange({ type: 'adjust', beforeQty: 10, afterQty: 7 })).toContain('System said 10, counted 7');
  });

  it('explains the Low Stock badge count', () => {
    const lowStock = [
      ...Array.from({ length: 12 }, () => ({ stockQuantity: 2 })),
      ...Array.from({ length: 4 }, () => ({ stockQuantity: 0 })),
    ];
    expect(reorderBadgeTitle(lowStock)).toBe('16 need reordering: 12 low, 4 out of stock');
  });

  it('never shows +0 or -0 for a net change', () => {
    expect(signedNet(0)).toBe('0');
    expect(signedNet(-0)).toBe('0');
    expect(signedNet(5)).toBe('+5');
    expect(signedNet(-3)).toBe('-3');
  });
});
