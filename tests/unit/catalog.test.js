// Catalog logic
//
// The PHP version did this work in SQL, so it was only ever tested by
// looking at the page. Here it is plain JavaScript, which means the rules
// that decide what the shop sees can be checked directly.
//
// The stock status rule matters most. Every badge, the alert bell, the low
// stock report, the reorder checklist and the alert emails all read it, so
// a mistake here would quietly change what the system considers urgent.
//
// No emulator is needed: none of this touches the network.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  stockStatus,
  stockStatusLabel,
  peso,
  pesoShort,
  shortDate,
  todayIso,
  esc,
  friendlyError,
} from '../../app-firebase/src/lib/dom.js';
import {
  filterMaterials,
  sortMaterials,
  categoriesOf,
  lowStockOf,
  categoryStats,
  supplierStats,
  inventoryValue,
  validateMaterial,
} from '../../app-firebase/src/lib/materials.js';
import { setCurrentUser, clearCurrentUser } from '../../app-firebase/src/lib/session.js';

// A small catalog modelled on the shop's real materials
const catalog = [
  { id: 'm1', name: 'Kiln-Dried Narra Lumber', category: 'wood', unit: 'pcs', size: '2x6x8ft', stockQuantity: 150, minThreshold: 50, costPerUnit: 350, supplierId: 's1', supplierName: 'Antipolo Hardwood Supply' },
  { id: 'm2', name: 'Mahogany Plank', category: 'wood', unit: 'pcs', size: '1x4x8ft', stockQuantity: 18, minThreshold: 30, costPerUnit: 220, supplierId: 's1', supplierName: 'Antipolo Hardwood Supply' },
  { id: 'm3', name: 'Marine Plywood 18mm', category: 'plywood', unit: 'sheet', size: '4x8ft', stockQuantity: 40, minThreshold: 20, costPerUnit: 950, supplierId: 's2', supplierName: 'Rizal Plywood and Foam Depot' },
  { id: 'm4', name: 'Foam Padding Roll', category: 'foam', unit: 'roll', size: '2in thick', stockQuantity: 0, minThreshold: 5, costPerUnit: 480, supplierId: 's2', supplierName: 'Rizal Plywood and Foam Depot' },
  { id: 'm5', name: 'Steel Angle Bar', category: 'metal', unit: 'pcs', size: '2x2in', stockQuantity: 5, minThreshold: 20, costPerUnit: 210, supplierId: 's3', supplierName: 'Sierra Metalworks Trading' },
];

const suppliers = [
  { id: 's1', name: 'Antipolo Hardwood Supply', viberContact: '09171234567' },
  { id: 's2', name: 'Rizal Plywood and Foam Depot', viberContact: '09182345678' },
  { id: 's3', name: 'Sierra Metalworks Trading', viberContact: '09193456789' },
  { id: 's4', name: 'Unused Supplier', viberContact: '' },
];

function signInAs(role) {
  setCurrentUser({
    uid: 'uid_test',
    email: 'test@example.com',
    name: 'Test User',
    role,
    status: 'active',
    emailVerified: true,
    provider: 'password',
  });
}

beforeEach(() => clearCurrentUser());

// ============================================================
// THE STOCK STATUS RULE
// ============================================================

describe('stockStatus', () => {
  it('calls nothing left "out", whatever the threshold', () => {
    expect(stockStatus(0, 5)).toBe('out');
    expect(stockStatus(0, 0)).toBe('out');
  });

  it('treats the threshold itself as low, not healthy', () => {
    // This boundary is the whole alerting rule: at exactly the threshold the
    // material must already be reordered, not wait until it goes below.
    expect(stockStatus(30, 30)).toBe('low');
    expect(stockStatus(29, 30)).toBe('low');
    expect(stockStatus(31, 30)).toBe('healthy');
  });

  it('calls stock above the threshold healthy', () => {
    expect(stockStatus(150, 50)).toBe('healthy');
  });

  it('treats a zero threshold as healthy while any stock remains', () => {
    // Staff add materials with the threshold left at zero, so this is the
    // normal state of a newly added material rather than an edge case.
    expect(stockStatus(3, 0)).toBe('healthy');
    expect(stockStatus(0, 0)).toBe('out');
  });

  it('reads string quantities, which is how form input arrives', () => {
    expect(stockStatus('0', '5')).toBe('out');
    expect(stockStatus('18', '30')).toBe('low');
  });

  it('labels each status the way the badges read', () => {
    expect(stockStatusLabel('out')).toBe('Out of Stock');
    expect(stockStatusLabel('low')).toBe('Low Stock');
    expect(stockStatusLabel('healthy')).toBe('Healthy');
  });
});

// ============================================================
// LOW STOCK
// ============================================================

describe('lowStockOf', () => {
  it('includes everything at or below its threshold, worst first', () => {
    const low = lowStockOf(catalog);

    expect(low.map((m) => m.id)).toEqual(['m4', 'm5', 'm2']);
  });

  it('leaves out healthy materials', () => {
    const low = lowStockOf(catalog);

    expect(low.find((m) => m.id === 'm1')).toBeUndefined();
    expect(low.find((m) => m.id === 'm3')).toBeUndefined();
  });
});

// ============================================================
// FILTERS, SORT AND SEARCH
// ============================================================

describe('filterMaterials', () => {
  it('returns everything when no filter is set', () => {
    expect(filterMaterials(catalog, {})).toHaveLength(5);
  });

  it('searches the name and the category, case-insensitively', () => {
    expect(filterMaterials(catalog, { keyword: 'mahogany' }).map((m) => m.id)).toEqual(['m2']);
    expect(filterMaterials(catalog, { keyword: 'plywood' }).map((m) => m.id)).toEqual(['m3']);
  });

  it('matches a keyword anywhere in the text, as the old SQL LIKE did', () => {
    // "wood" also finds the plywood category, because the PHP query was
    // LIKE '%wood%' and that behaviour is kept deliberately: a user typing
    // "wood" is looking for timber of any kind.
    expect(filterMaterials(catalog, { keyword: 'WOOD' }).map((m) => m.id))
      .toEqual(['m1', 'm2', 'm3']);
  });

  it('ignores surrounding spaces in the search box', () => {
    expect(filterMaterials(catalog, { keyword: '  narra  ' }).map((m) => m.id)).toEqual(['m1']);
  });

  it('filters by category', () => {
    expect(filterMaterials(catalog, { category: 'metal' }).map((m) => m.id)).toEqual(['m5']);
  });

  it('filters by stock status using the same rule as the badges', () => {
    expect(filterMaterials(catalog, { status: 'out' }).map((m) => m.id)).toEqual(['m4']);
    expect(filterMaterials(catalog, { status: 'low' }).map((m) => m.id)).toEqual(['m2', 'm5']);
    expect(filterMaterials(catalog, { status: 'healthy' }).map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('filters by supplier', () => {
    // Ordered by name, so the foam roll comes before the marine plywood
    expect(filterMaterials(catalog, { supplierId: 's2' }).map((m) => m.id)).toEqual(['m4', 'm3']);
  });

  it('sorts by name by default, as the catalog page opens', () => {
    expect(filterMaterials(catalog, {}).map((m) => m.name)[0]).toBe('Foam Padding Roll');
  });

  it('applies several filters together', () => {
    const rows = filterMaterials(catalog, { category: 'wood', status: 'low' });

    expect(rows.map((m) => m.id)).toEqual(['m2']);
  });

  it('returns nothing when the filters match nothing', () => {
    expect(filterMaterials(catalog, { category: 'wood', status: 'out' })).toEqual([]);
  });
});

describe('sortMaterials', () => {
  it('sorts by name in both directions', () => {
    expect(sortMaterials(catalog, 'name', 'asc')[0].name).toBe('Foam Padding Roll');
    expect(sortMaterials(catalog, 'name', 'desc')[0].name).toBe('Steel Angle Bar');
  });

  it('sorts stock numerically, not as text', () => {
    // Sorted as text, 150 would come before 18, which is the bug this guards
    expect(sortMaterials(catalog, 'stock', 'asc').map((m) => m.stockQuantity))
      .toEqual([0, 5, 18, 40, 150]);
  });

  it('sorts by cost and by supplier', () => {
    expect(sortMaterials(catalog, 'cost', 'desc')[0].id).toBe('m3');
    expect(sortMaterials(catalog, 'supplier', 'asc')[0].supplierName)
      .toBe('Antipolo Hardwood Supply');
  });

  it('falls back to the name when the sort key is not recognised', () => {
    // A tampered URL cannot produce a nonsensical order, which is what
    // sortColumn() guarded against in the PHP model
    expect(sortMaterials(catalog, 'nonsense; DROP TABLE', 'asc')[0].name)
      .toBe('Foam Padding Roll');
  });

  it('does not modify the list it was given', () => {
    const original = catalog.map((m) => m.id);
    sortMaterials(catalog, 'stock', 'desc');

    expect(catalog.map((m) => m.id)).toEqual(original);
  });
});

describe('categoriesOf', () => {
  it('lists each category once, in order', () => {
    expect(categoriesOf(catalog)).toEqual(['foam', 'metal', 'plywood', 'wood']);
  });

  it('skips materials with no category', () => {
    expect(categoriesOf([...catalog, { id: 'x', name: 'Odd', category: '' }]))
      .toEqual(['foam', 'metal', 'plywood', 'wood']);
  });
});

// ============================================================
// GROUPED SUMMARIES
// ============================================================

describe('categoryStats', () => {
  it('counts items, stock and value per category', () => {
    const wood = categoryStats(catalog).find((row) => row.category === 'wood');

    expect(wood.itemCount).toBe(2);
    expect(wood.totalStock).toBe(168);
    // 150 x 350 plus 18 x 220
    expect(wood.totalValue).toBe(150 * 350 + 18 * 220);
  });

  it('counts out-of-stock and low-stock separately, never twice', () => {
    const stats = categoryStats(catalog);
    const foam = stats.find((row) => row.category === 'foam');
    const wood = stats.find((row) => row.category === 'wood');

    // Foam is empty, so it counts as out and not also as low
    expect(foam.outCount).toBe(1);
    expect(foam.lowCount).toBe(0);

    expect(wood.outCount).toBe(0);
    expect(wood.lowCount).toBe(1);
  });

  it('adds up to no value when there is no cost data, as it is for staff', () => {
    // Staff receive materials with no costPerUnit at all, because the rules
    // refuse them the material_costs collection
    const withoutCosts = catalog.map(({ costPerUnit, ...rest }) => rest);
    const stats = categoryStats(withoutCosts);

    expect(stats.every((row) => row.totalValue === 0)).toBe(true);
    // The counts still work, which is what staff do see
    expect(stats.find((row) => row.category === 'wood').itemCount).toBe(2);
  });
});

describe('supplierStats', () => {
  it('counts the materials each supplier provides', () => {
    const stats = supplierStats(suppliers, catalog);

    expect(stats.find((s) => s.id === 's1').itemCount).toBe(2);
    expect(stats.find((s) => s.id === 's3').itemCount).toBe(1);
  });

  it('keeps suppliers that have no materials yet', () => {
    // The SQL version used a LEFT JOIN for exactly this
    const unused = supplierStats(suppliers, catalog).find((s) => s.id === 's4');

    expect(unused).toBeDefined();
    expect(unused.itemCount).toBe(0);
    expect(unused.totalValue).toBe(0);
  });

  it('counts how many materials from each supplier need reordering', () => {
    const stats = supplierStats(suppliers, catalog);

    // s2 supplies plywood (healthy) and foam (empty)
    expect(stats.find((s) => s.id === 's2').reorderCount).toBe(1);
    // s3 supplies only the angle bar, which is low
    expect(stats.find((s) => s.id === 's3').reorderCount).toBe(1);
  });

  it('totals the stock value per supplier', () => {
    const s1 = supplierStats(suppliers, catalog).find((s) => s.id === 's1');

    expect(s1.totalValue).toBe(150 * 350 + 18 * 220);
  });
});

describe('inventoryValue', () => {
  it('multiplies stock by cost across the catalog', () => {
    const expected =
      150 * 350 + 18 * 220 + 40 * 950 + 0 * 480 + 5 * 210;

    expect(inventoryValue(catalog)).toBe(expected);
  });

  it('treats a missing cost as nothing rather than failing', () => {
    const mixed = [{ stockQuantity: 10, costPerUnit: null }, { stockQuantity: 5, costPerUnit: 20 }];

    expect(inventoryValue(mixed)).toBe(100);
  });
});

// ============================================================
// VALIDATION
// Ported from MaterialController::validate(), including the part where the
// manager fields are only checked for a manager.
// ============================================================

describe('validateMaterial', () => {
  it('requires a name, a category and a unit', () => {
    signInAs('production_staff');
    const errors = validateMaterial({ name: '', category: '', unit: '', stockQuantity: '0' }, { isCreate: true });

    expect(errors).toContain('Material name is required.');
    expect(errors).toContain('Category is required.');
    expect(errors).toContain('Unit is required.');
  });

  it('requires a whole, non-negative opening stock when adding', () => {
    signInAs('production_staff');
    const base = { name: 'Plank', category: 'wood', unit: 'pcs' };

    expect(validateMaterial({ ...base, stockQuantity: '' }, { isCreate: true })).toHaveLength(1);
    expect(validateMaterial({ ...base, stockQuantity: '-5' }, { isCreate: true })).toHaveLength(1);
    expect(validateMaterial({ ...base, stockQuantity: '2.5' }, { isCreate: true })).toHaveLength(1);
    expect(validateMaterial({ ...base, stockQuantity: '0' }, { isCreate: true })).toEqual([]);
  });

  it('does not ask for opening stock when editing', () => {
    signInAs('production_staff');
    const errors = validateMaterial(
      { name: 'Plank', category: 'wood', unit: 'pcs' },
      { isCreate: false }
    );

    expect(errors).toEqual([]);
  });

  it('checks the threshold and cost only for a manager', () => {
    const input = {
      name: 'Plank',
      category: 'wood',
      unit: 'pcs',
      stockQuantity: '10',
      minThreshold: 'not a number',
      costPerUnit: 'also not a number',
    };

    // Staff never submit these fields, so they are not validated for them
    signInAs('production_staff');
    expect(validateMaterial(input, { isCreate: true })).toEqual([]);

    signInAs('general_manager');
    const errors = validateMaterial(input, { isCreate: true });
    expect(errors).toContain('Minimum threshold must be a whole number that is zero or more.');
    expect(errors).toContain('Cost per unit must be a valid number.');
  });

  it('accepts an empty cost from a manager, since it is optional', () => {
    signInAs('general_manager');
    const errors = validateMaterial(
      { name: 'Plank', category: 'wood', unit: 'pcs', stockQuantity: '10', minThreshold: '5', costPerUnit: '' },
      { isCreate: true }
    );

    expect(errors).toEqual([]);
  });
});

// ============================================================
// DISPLAY HELPERS
// Ported from peso(), pesoShort() and shortDate() in config/app.php.
// ============================================================

describe('display helpers', () => {
  it('formats pesos with separators and two decimals', () => {
    expect(peso(12500)).toBe('PHP 12,500.00');
    expect(peso(350)).toBe('PHP 350.00');
  });

  it('shows a dash when no cost has been recorded', () => {
    expect(peso(null)).toBe('-');
    expect(peso('')).toBe('-');
    expect(peso(undefined)).toBe('-');
  });

  it('shortens large figures for the dashboard tile', () => {
    expect(pesoShort(1250000)).toBe('PHP 1.25M');
    expect(pesoShort(125000)).toBe('PHP 125.0K');
    expect(pesoShort(9500)).toBe('PHP 9,500.00');
  });

  it('formats a stored date readably', () => {
    expect(shortDate('2026-08-21')).toBe('Aug 21, 2026');
    expect(shortDate(null)).toBe('-');
  });

  it('reads a plain date as local time, so the day does not slip', () => {
    // Parsed as UTC, 2026-01-01 would show as Dec 31 in a +08:00 timezone
    expect(shortDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('produces today in the same format the movement forms store', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('escapes anything a user typed before it reaches the page', () => {
    expect(esc('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(esc(`Mahogany "A" & 'B'`)).toBe('Mahogany &quot;A&quot; &amp; &#039;B&#039;');
  });
});

// ============================================================
// ERROR MESSAGES
//
// What the shop floor is shown when something fails. The rule is that no
// message may carry a URL or a stack trace: those belong in the browser
// console, which friendlyError() also writes to.
// ============================================================

describe('friendlyError', () => {
  function firebaseError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  it('explains a missing index without the console link', () => {
    // The real message Firestore produces, which ends in a link several
    // hundred characters long and used to stretch the alert off the page
    const error = firebaseError(
      'failed-precondition',
      'The query requires an index. You can create it here: ' +
        'https://console.firebase.google.com/v1/r/project/cornerblock-inventory/firestore/indexes?create_composite=ClFwcm9qZWN0cy9jb3JuZXJibG9jay1pbnZlbnRvcnkvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3N1cHBsaWVycy9pbmRleGVzL18QARoOCgppc0FyY2hpdmVkEAEaCAoEbmFtZRABGgwKCF9fbmFtZV9fEAE'
    );

    const message = friendlyError(error);

    expect(message).not.toContain('http');
    expect(message).not.toContain('console.firebase');
    expect(message).toContain('still being built');
    expect(message).toContain('Try again shortly');
  });

  it('strips a url out of any other message', () => {
    const message = friendlyError(new Error('Something failed, see https://example.com/a/very/long/path'));

    expect(message).not.toContain('http');
    expect(message).toContain('Something failed');
  });

  it('removes the FirebaseError prefix the sdk adds', () => {
    expect(friendlyError(new Error('FirebaseError: the thing broke'))).not.toContain('FirebaseError');
  });

  it('uses its own wording for the codes it knows', () => {
    expect(friendlyError(firebaseError('permission-denied', 'raw text'))).toBe(
      'You do not have permission to do that.'
    );
    expect(friendlyError(firebaseError('unavailable', 'raw text'))).toContain('No connection');
  });

  it('explains running out of the free daily allowance', () => {
    // Worth its own wording: on this plan it is a real possibility and the
    // shop needs to know it is not a fault they can fix
    expect(friendlyError(firebaseError('resource-exhausted', 'quota'))).toContain(
      'daily free allowance'
    );
  });

  it('falls back to something sayable when there is no message at all', () => {
    expect(friendlyError(new Error(''))).toBe('Something went wrong. Please try again.');
    expect(friendlyError({})).toBe('Something went wrong. Please try again.');
  });

  it('does not leave a dangling word where the url was', () => {
    const message = friendlyError(new Error('It broke, see https://example.com/x'));

    expect(message).not.toMatch(/,\s*(see|at|here)?\s*\.?$/);
    expect(message.endsWith('.')).toBe(true);
  });
});
