// The four reports exported to Google Sheets
//
// The rows each report sends, checked without a browser or Google: the
// columns in order, numbers as numbers, categories in Title Case, the Total
// rows, the filters on screen applied, and the spreadsheet titles. Also the
// pieces the export shares with Movement History: the Sheets formatting,
// the CSV fallback and the audit label.

import { describe, it, expect } from 'vitest';

import {
  inventoryExportTabs,
  lowStockExportTabs,
  movementReportExportTabs,
  valueExportTabs,
  movementsForReport,
  valueReportRows,
  reportExportTitle,
  movementReportExportTitle,
  exportRowCount,
  tabsAsCsvRows,
  INVENTORY_EXPORT_HEADER,
  LOW_STOCK_EXPORT_HEADER,
  VALUE_EXPORT_HEADER,
} from '../../app-firebase/src/lib/reportExport.js';
import { MOVEMENT_EXPORT_HEADER } from '../../app-firebase/src/lib/movementExport.js';
import { filterMaterials, lowStockOf } from '../../app-firebase/src/lib/materials.js';
import { formatRequests } from '../../app-firebase/src/lib/sheets.js';
import { toCsv, actionLabel, isKnownAction } from '../../app-firebase/src/lib/auditTrail.js';

// A small catalog: the same shape loadCatalog() returns
const catalog = [
  {
    id: 'm1', name: 'Mahogany Plank 1x4', category: 'solid wood', size: '1x4x8', unit: 'pcs',
    stockQuantity: 20, minThreshold: 5, costPerUnit: 220.5, supplierId: 's1', supplierName: 'Lumber Co',
  },
  {
    id: 'm2', name: 'Narra Plank 2x2', category: 'solid wood', size: '', unit: 'pcs',
    stockQuantity: 3, minThreshold: 5, costPerUnit: 150, supplierId: 's1', supplierName: 'Lumber Co',
  },
  {
    id: 'm3', name: 'Wood Glue', category: 'adhesives', size: '1 gal', unit: 'can',
    stockQuantity: 0, minThreshold: 2, costPerUnit: 480, supplierId: 's2', supplierName: 'Bond Supply',
  },
  {
    // Never priced: its cost stays blank in the export, never 0
    id: 'm4', name: 'Sandpaper 120', category: 'abrasives', size: '', unit: 'sheet',
    stockQuantity: 40, minThreshold: 10, costPerUnit: null, supplierId: null, supplierName: null,
  },
];

const suppliersById = new Map([
  ['s1', { id: 's1', name: 'Lumber Co', viberContact: '0917 555 0101' }],
  ['s2', { id: 's2', name: 'Bond Supply', viberContact: '' }],
]);

// ============================================================
// 1. INVENTORY REPORT
// ============================================================

describe('the Inventory Report export', () => {
  it('has the columns in the order asked for', () => {
    const [tab] = inventoryExportTabs(catalog);
    expect(tab.rows[0]).toEqual([
      'Material', 'Category', 'Size', 'Unit', 'Stock', 'Min Threshold', 'Status',
      'Supplier', 'Cost / Unit', 'Total Value',
    ]);
    expect(tab.rows[0]).toEqual(INVENTORY_EXPORT_HEADER);
  });

  it('sends numbers as numbers and the category in Title Case', () => {
    const [tab] = inventoryExportTabs(catalog);
    expect(tab.rows[1]).toEqual([
      'Mahogany Plank 1x4', 'Solid Wood', '1x4x8', 'pcs', 20, 5, 'Healthy', 'Lumber Co', 220.5, 4410,
    ]);
    expect(tab.rows[3][6]).toBe('Out of Stock');
  });

  it('leaves a missing cost blank rather than 0', () => {
    const [tab] = inventoryExportTabs(catalog);
    expect(tab.rows[4].slice(-3)).toEqual(['', '', '']);
  });

  it('ends with a Total row of units and value', () => {
    const [tab] = inventoryExportTabs(catalog);
    const total = tab.rows.at(-1);
    expect(total[0]).toBe('Total');
    expect(total[4]).toBe(63); // 20 + 3 + 0 + 40
    expect(total[9]).toBe(4410 + 450 + 0); // the unpriced material adds nothing
    expect(tab.total).toBe(true);
    expect(exportRowCount([tab])).toBe(4);
  });

  it('holds only what the filters on screen show', () => {
    const shown = filterMaterials(catalog, { category: 'solid wood', status: 'low' });
    const [tab] = inventoryExportTabs(shown);
    expect(tab.rows.slice(1, -1).map((row) => row[0])).toEqual(['Narra Plank 2x2']);
    expect(tab.rows.at(-1)[4]).toBe(3);
    expect(tab.rows.at(-1)[9]).toBe(450);
  });

  it('formats Cost / Unit and Total Value as pesos', () => {
    const [tab] = inventoryExportTabs(catalog);
    expect(tab.moneyColumns.map((i) => tab.rows[0][i])).toEqual(['Cost / Unit', 'Total Value']);
  });
});

// ============================================================
// 2. LOW STOCK REPORT
// ============================================================

describe('the Low Stock Report export', () => {
  const shown = lowStockOf(catalog);

  it('has the columns asked for, with the supplier Viber contact', () => {
    const [tab] = lowStockExportTabs(shown, suppliersById);
    expect(tab.rows[0]).toEqual([
      'Material', 'Category', 'Unit', 'Current Stock', 'Min Threshold', 'Shortfall',
      'Status', 'Supplier', 'Supplier Viber contact',
    ]);
    expect(tab.rows[0]).toEqual(LOW_STOCK_EXPORT_HEADER);
  });

  it('is ordered worst first, as on screen', () => {
    const [tab] = lowStockExportTabs(shown, suppliersById);
    expect(tab.rows.slice(1).map((row) => row[0])).toEqual(['Wood Glue', 'Narra Plank 2x2']);
  });

  it('works out the shortfall and sends it as a number', () => {
    const [tab] = lowStockExportTabs(shown, suppliersById);
    expect(tab.rows[1]).toEqual(['Wood Glue', 'Adhesives', 'can', 0, 2, 2, 'Out of Stock', 'Bond Supply', '']);
    expect(tab.rows[2]).toEqual([
      'Narra Plank 2x2', 'Solid Wood', 'pcs', 3, 5, 2, 'Low Stock', 'Lumber Co', '0917 555 0101',
    ]);
  });

  it('has no Total row', () => {
    const [tab] = lowStockExportTabs(shown, suppliersById);
    expect(tab.total).toBe(false);
    expect(exportRowCount([tab])).toBe(2);
  });

  it('holds only the category chosen', () => {
    const [tab] = lowStockExportTabs(lowStockOf(catalog.filter((m) => m.category === 'adhesives')), suppliersById);
    expect(tab.rows.slice(1).map((row) => row[0])).toEqual(['Wood Glue']);
  });
});

// ============================================================
// 3. STOCK MOVEMENT REPORT
// ============================================================

describe('the Stock Movement Report export', () => {
  const movements = [
    {
      id: 'a', materialId: 'm1', materialName: 'Mahogany Plank 1x4', type: 'out', quantity: 4,
      reason: 'Project Usage', project: 'Sofa set for Ms. Reyes', reference: '', notes: 'frame',
      loggedByName: 'Juan', afterQty: 20, createdAt: new Date('2026-11-02T07:04:00Z'),
    },
    {
      id: 'b', materialId: 'm3', materialName: 'Wood Glue', type: 'in', quantity: 6,
      reason: 'Purchase', reference: 'PO-1042', notes: '', loggedByName: 'Ana', afterQty: 6,
      createdAt: new Date('2026-11-01T02:00:00Z'),
    },
    {
      id: 'c', materialId: 'm2', materialName: 'Narra Plank 2x2', type: 'out', quantity: 1,
      reason: 'Damaged', project: '', reference: '', notes: 'split', loggedByName: 'Juan', afterQty: 3,
      createdAt: new Date('2026-10-30T02:00:00Z'),
    },
  ];

  it('uses the same columns as the Movement History export, without the cost columns', () => {
    const [tab] = movementReportExportTabs(movements, catalog);
    expect(tab.rows[0]).toEqual(MOVEMENT_EXPORT_HEADER);
    expect(tab.rows[0]).toEqual([
      'Date and time', 'Type', 'Material', 'Category', 'Quantity', 'Unit', 'Reason',
      'Project', 'Reference', 'Notes', 'Logged by', 'Stock after',
    ]);
    expect(tab.rows[1]).toEqual([
      'Nov 2, 2026, 3:04 PM', 'Stock Out', 'Mahogany Plank 1x4', 'Solid Wood', 4, 'pcs',
      'Project Usage', 'Sofa set for Ms. Reyes', '', 'frame', 'Juan', 20,
    ]);
  });

  it('applies the type, category, material and search on screen', () => {
    const ids = (filters) => movementsForReport(movements, catalog, filters).map((m) => m.id);

    expect(ids({})).toEqual(['a', 'b', 'c']);
    expect(ids({ type: 'out' })).toEqual(['a', 'c']);
    expect(ids({ category: 'solid wood' })).toEqual(['a', 'c']);
    expect(ids({ materialId: 'm3' })).toEqual(['b']);
    expect(ids({ keyword: 'reyes' })).toEqual(['a']);
    expect(ids({ type: 'out', category: 'solid wood', keyword: 'split' })).toEqual(['c']);
  });

  it('exports exactly the movements the filters leave', () => {
    const shown = movementsForReport(movements, catalog, { type: 'out' });
    const [tab] = movementReportExportTabs(shown, catalog);
    expect(tab.rows.slice(1).map((row) => row[2])).toEqual(['Mahogany Plank 1x4', 'Narra Plank 2x2']);
    expect(exportRowCount([tab])).toBe(2);
  });
});

// ============================================================
// 4. INVENTORY VALUE REPORT
// ============================================================

describe('the Inventory Value Report export', () => {
  const { materials, byCategory } = valueReportRows(catalog);
  const [main, categories] = valueExportTabs(materials, byCategory);

  it('has the columns asked for, most valuable first', () => {
    expect(main.rows[0]).toEqual([
      'Material', 'Category', 'Stock', 'Unit', 'Cost / Unit', 'Total Value', 'Share (%)',
    ]);
    expect(main.rows[0]).toEqual(VALUE_EXPORT_HEADER);
    expect(main.rows.slice(1, -1).map((row) => row[0])).toEqual([
      // The two worth nothing follow, by name
      'Mahogany Plank 1x4', 'Narra Plank 2x2', 'Sandpaper 120', 'Wood Glue',
    ]);
  });

  it('gives each share as a number, to one decimal', () => {
    // 4410 of 4860 is 90.74...%
    expect(main.rows[1]).toEqual(['Mahogany Plank 1x4', 'Solid Wood', 20, 'pcs', 220.5, 4410, 90.7]);
    expect(main.rows[2].slice(-2)).toEqual([450, 9.3]);
    // Never priced, and priced but out of stock
    expect(main.rows[3].slice(-3)).toEqual(['', '', '']);
    expect(main.rows[4].slice(-3)).toEqual([480, 0, 0]);
  });

  it('ends with a Total row', () => {
    expect(main.rows.at(-1)).toEqual(['Total', '', '', '', '', 4860, 100]);
    expect(main.total).toBe(true);
  });

  it('adds a By Category tab with Category, Total Value and Share (%)', () => {
    expect(categories.name).toBe('By Category');
    expect(categories.rows).toEqual([
      ['Category', 'Total Value', 'Share (%)'],
      ['Solid Wood', 4860, 100],
      ['Total', 4860, 100],
    ]);
  });

  it('holds only the category chosen', () => {
    const scope = catalog.filter((m) => m.category === 'adhesives');
    const filtered = valueReportRows(scope);
    const [tab, byCat] = valueExportTabs(filtered.materials, filtered.byCategory);
    expect(tab.rows.slice(1, -1).map((row) => row[0])).toEqual(['Wood Glue']);
    expect(tab.rows.at(-1)).toEqual(['Total', '', '', '', '', 0, 0]);
    expect(byCat.rows.slice(1, -1)).toEqual([]);
  });
});

// ============================================================
// TITLES
// ============================================================

describe('the spreadsheet titles', () => {
  it('names the report and the day, with no filters', () => {
    expect(reportExportTitle('Inventory Report', [], '2026-11-02')).toBe(
      'Cornerblock Inventory Report – as of Nov 2, 2026'
    );
  });

  it('lists the filters on screen between them', () => {
    expect(reportExportTitle('Inventory Report', ['Solid Wood', 'Low Stock', 'Lumber Co'], '2026-11-02')).toBe(
      'Cornerblock Inventory Report – Solid Wood, Low Stock, Lumber Co – as of Nov 2, 2026'
    );
    expect(reportExportTitle('Low Stock Report', ['Adhesives'], '2026-11-02')).toBe(
      'Cornerblock Low Stock Report – Adhesives – as of Nov 2, 2026'
    );
    expect(reportExportTitle('Inventory Value Report', [], '2026-11-02')).toBe(
      'Cornerblock Inventory Value Report – as of Nov 2, 2026'
    );
  });

  it('gives the movement report its date range instead of "as of"', () => {
    expect(movementReportExportTitle([], '2026-10-04', '2026-11-02')).toBe(
      'Cornerblock Stock Movement Report – Oct 4 to Nov 2, 2026'
    );
    expect(movementReportExportTitle(['Stock Out', 'Solid Wood'], '2026-11-02', '2026-11-02')).toBe(
      'Cornerblock Stock Movement Report – Stock Out, Solid Wood – Nov 2, 2026'
    );
    expect(movementReportExportTitle([], '', '')).toBe('Cornerblock Stock Movement Report – All time');
  });
});

// ============================================================
// SHARED WITH MOVEMENT HISTORY
// ============================================================

describe('the Sheets formatting', () => {
  it('bolds the header, shows pesos with two decimals and bolds the Total row', () => {
    const requests = formatRequests(7, { columnCount: 10, rowCount: 6, moneyColumns: [8, 9], total: true });
    const [header, cost, value, total, resize] = requests;

    expect(header.repeatCell.range).toEqual({ sheetId: 7, startRowIndex: 0, endRowIndex: 1 });
    expect(cost.repeatCell.range).toMatchObject({ startColumnIndex: 8, endColumnIndex: 9, startRowIndex: 1 });
    expect(value.repeatCell.cell.userEnteredFormat.numberFormat.pattern).toBe('#,##0.00');
    expect(total.repeatCell.range).toEqual({ sheetId: 7, startRowIndex: 5, endRowIndex: 6 });
    expect(resize.autoResizeDimensions.dimensions.endIndex).toBe(10);
  });

  it('is just the header and column sizes when there is nothing else to format', () => {
    expect(formatRequests(0, { columnCount: 12, rowCount: 4 })).toHaveLength(2);
  });
});

describe('the CSV fallback', () => {
  it('puts both value report tabs in one file, each under its name', () => {
    const { materials, byCategory } = valueReportRows(catalog);
    const rows = tabsAsCsvRows(valueExportTabs(materials, byCategory));
    expect(rows[0]).toEqual(['Inventory Value']);
    expect(rows).toContainEqual([]);
    expect(rows).toContainEqual(['By Category']);
  });

  it('keeps a single tab as it is', () => {
    const tabs = inventoryExportTabs(catalog);
    expect(tabsAsCsvRows(tabs)).toBe(tabs[0].rows);
  });

  it('writes numbers as numbers, while typed text that looks like a formula is still guarded', () => {
    const csv = toCsv([[-3, 4410.5, '=HYPERLINK("x")', '-note']]);
    expect(csv).toContain('-3,4410.5,');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'-note");
  });
});

describe('the audit entry', () => {
  it('has a label in the Audit Trail action list', () => {
    expect(isKnownAction('reports.export')).toBe(true);
    expect(actionLabel('reports.export')).toBe('Report exported');
  });
});
