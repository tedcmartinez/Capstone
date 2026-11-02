// The four reports, exported to Google Sheets
//
// The rows and the title for each report's export. Nothing here reads or
// writes the database, so the columns can be checked by unit tests. The
// page (pages/reports.js) shares one export routine between all four
// reports and only hands it what these return.
//
// Every number goes in as a number, not as text, so it can be summed and
// sorted in Sheets. A cost that was never recorded is left blank rather
// than shown as 0, which would read as "free". Categories are in Title Case.
//
// Each builder returns a list of tabs: { name, rows, moneyColumns, total }.
// rows starts with the header. moneyColumns are the column positions shown
// with two decimals in Sheets, and total says the last row is a Total row.

import { stockStatus, stockStatusLabel } from './dom.js';
import { categoryLabel } from './format.js';
import { movementExportRows } from './movementExport.js';
import { movementMatcher } from './movements.js';
import { categoryStats } from './materials.js';
import { describeRange, shopToday } from './dates.js';

export const INVENTORY_EXPORT_HEADER = [
  'Material',
  'Category',
  'Size',
  'Unit',
  'Stock',
  'Min Threshold',
  'Status',
  'Supplier',
  'Cost / Unit',
  'Total Value',
];

export const LOW_STOCK_EXPORT_HEADER = [
  'Material',
  'Category',
  'Unit',
  'Current Stock',
  'Min Threshold',
  'Shortfall',
  'Status',
  'Supplier',
  'Supplier Viber contact',
];

export const VALUE_EXPORT_HEADER = [
  'Material',
  'Category',
  'Stock',
  'Unit',
  'Cost / Unit',
  'Total Value',
  'Share (%)',
];

export const VALUE_BY_CATEGORY_HEADER = ['Category', 'Total Value', 'Share (%)'];

// ============================================================
// SMALL HELPERS
// ============================================================

// Pesos to the centavo, so 0.1 + 0.2 never shows as 0.30000000000000004
const money = (value) => Math.round(value * 100) / 100;

// A percentage to one decimal place, as the report shows it
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// The cost per unit as a number, or null when none was recorded
function costOf(material) {
  const cost = material.costPerUnit;
  if (cost === null || cost === undefined || cost === '') return null;
  const number = Number(cost);
  return Number.isFinite(number) ? number : null;
}

const stockOf = (material) => Number(material.stockQuantity) || 0;

// ============================================================
// WHAT TWO OF THE REPORTS SHOW
// Worked out here rather than in the page, so the table on screen and
// its export are built from exactly the same rows.
// ============================================================

// The Stock Movement Report's filters, applied to the movements read for
// its date range. The search covers material, reason, reference, project,
// notes and who logged it, using the same matching as Movement History.
// A chosen material already narrows to one category, so the category only
// applies when no material is chosen.
export function movementsForReport(movements, materials, { type = '', category = '', materialId = '', keyword = '' } = {}) {
  const inCategoryIds = category && !materialId
    ? new Set(materials.filter((m) => m.category === category).map((m) => m.id))
    : null;
  const match = movementMatcher({ materialIds: inCategoryIds, keyword });

  return movements.filter(
    (m) => (!type || m.type === type) && (!materialId || m.materialId === materialId) && (!match || match(m))
  );
}

// The Inventory Value Report: every material with its value, most valuable
// first (as Material::getValueReport() ordered it), and the categories that
// hold any value, largest first
export function valueReportRows(materials) {
  const rows = materials
    .map((material) => ({
      ...material,
      totalValue: (Number(material.stockQuantity) || 0) * (Number(material.costPerUnit) || 0),
    }))
    .sort((a, b) => b.totalValue - a.totalValue || a.name.localeCompare(b.name));

  const byCategory = categoryStats(materials)
    .filter((row) => row.totalValue > 0)
    .sort((a, b) => b.totalValue - a.totalValue);

  return { materials: rows, byCategory };
}

// ============================================================
// 1. INVENTORY REPORT
// ============================================================

// materials: the rows on screen, already filtered and in screen order
export function inventoryExportTabs(materials) {
  let totalUnits = 0;
  let totalValue = 0;

  const rows = materials.map((material) => {
    const stock = stockOf(material);
    const cost = costOf(material);
    const value = cost === null ? '' : money(stock * cost);

    totalUnits += stock;
    if (value !== '') totalValue += value;

    return [
      material.name || '',
      categoryLabel(material.category || ''),
      material.size || '',
      material.unit || '',
      stock,
      Number(material.minThreshold) || 0,
      stockStatusLabel(stockStatus(stock, material.minThreshold)),
      material.supplierName || '',
      cost === null ? '' : cost,
      value,
    ];
  });

  const total = ['Total', '', '', '', totalUnits, '', '', '', '', money(totalValue)];

  return [
    {
      name: 'Inventory',
      rows: [INVENTORY_EXPORT_HEADER, ...rows, total],
      moneyColumns: [8, 9],
      total: true,
    },
  ];
}

// ============================================================
// 2. LOW STOCK REPORT
// ============================================================

// materials: the low stock list on screen, worst first
// suppliersById: Map of supplier id to supplier ({ name, viberContact })
export function lowStockExportTabs(materials, suppliersById = new Map()) {
  const rows = materials.map((material) => {
    const stock = stockOf(material);
    const threshold = Number(material.minThreshold) || 0;
    const supplier = suppliersById.get(material.supplierId);

    return [
      material.name || '',
      categoryLabel(material.category || ''),
      material.unit || '',
      stock,
      threshold,
      Math.max(0, threshold - stock),
      stockStatusLabel(stockStatus(stock, threshold)),
      material.supplierName || supplier?.name || '',
      supplier?.viberContact || '',
    ];
  });

  return [{ name: 'Low Stock', rows: [LOW_STOCK_EXPORT_HEADER, ...rows], moneyColumns: [], total: false }];
}

// ============================================================
// 3. STOCK MOVEMENT REPORT
// The same columns as the Movement History export, from the same builder,
// without the manager's cost columns, which this report does not show.
// ============================================================

// movements: the movements on screen, already filtered, newest first
export function movementReportExportTabs(movements, materials) {
  const rows = movementExportRows(movements, {
    materialsById: new Map(materials.map((m) => [m.id, m])),
  });

  return [{ name: 'Stock Movements', rows, moneyColumns: [], total: false }];
}

// ============================================================
// 4. INVENTORY VALUE REPORT
// ============================================================

// materials: the materials on screen, most valuable first. Each carries
// totalValue, worked out by the page exactly as it shows it.
// byCategory: the "Value by Category" list on screen ({ category, totalValue })
export function valueExportTabs(materials, byCategory) {
  const total = money(materials.reduce((sum, m) => sum + (Number(m.totalValue) || 0), 0));

  const rows = materials.map((material) => {
    const cost = costOf(material);
    const value = cost === null ? '' : money(Number(material.totalValue) || 0);

    return [
      material.name || '',
      categoryLabel(material.category || ''),
      stockOf(material),
      material.unit || '',
      cost === null ? '' : cost,
      value,
      value === '' ? '' : percent(value, total),
    ];
  });

  const categoryRows = byCategory.map((row) => [
    categoryLabel(row.category),
    money(row.totalValue),
    percent(row.totalValue, total),
  ]);

  const shareTotal = total > 0 ? 100 : 0;

  return [
    {
      name: 'Inventory Value',
      rows: [VALUE_EXPORT_HEADER, ...rows, ['Total', '', '', '', '', total, shareTotal]],
      moneyColumns: [4, 5],
      total: true,
    },
    {
      name: 'By Category',
      rows: [VALUE_BY_CATEGORY_HEADER, ...categoryRows, ['Total', total, shareTotal]],
      moneyColumns: [1],
      total: true,
    },
  ];
}

// ============================================================
// TITLES
// ============================================================

// filters: the filters on screen in words, e.g. ['Solid Wood', 'Low Stock']
//
// "Cornerblock Inventory Report – Solid Wood, Low Stock – as of Nov 2, 2026",
// or without the middle part when nothing is filtered
export function reportExportTitle(reportName, filters = [], today = shopToday()) {
  const asOf = `as of ${describeRange(today, today).replace(/^on /, '')}`;
  return ['Cornerblock ' + reportName, filters.join(', '), asOf].filter(Boolean).join(' – ');
}

// The movement report says its date range instead of "as of":
// "Cornerblock Stock Movement Report – Stock Out – Nov 1 to Nov 2, 2026"
export function movementReportExportTitle(filters = [], from = '', to = '') {
  const range = describeRange(from, to).replace(/^(from|on) /, '') || 'All time';
  return ['Cornerblock Stock Movement Report', filters.join(', '), range].filter(Boolean).join(' – ');
}

// How many data rows a set of tabs holds: the first tab, less its header
// and its Total row. This is the count the audit entry records.
export function exportRowCount(tabs) {
  const first = tabs[0];
  if (!first) return 0;
  return first.rows.length - 1 - (first.total ? 1 : 0);
}

// The CSV fallback holds every tab in one file, each after a line with its
// name, so a two-tab report still arrives as a single download
export function tabsAsCsvRows(tabs) {
  if (tabs.length === 1) return tabs[0].rows;
  return tabs.flatMap((tab, index) => [...(index > 0 ? [[]] : []), [tab.name], ...tab.rows]);
}
