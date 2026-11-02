// Movement History export to Google Sheets
//
// The rows and the title for exporting the movement history. Built here,
// with no Firebase imports, so the columns can be checked by unit tests.
//
// Columns, in order:
//   Date and time, Type, Material, Category, Quantity, Unit, Reason,
//   Project, Reference, Notes, Logged by, Stock after
// and, for a manager or the webmaster only:
//   Unit cost, Value (at current cost)
//
// Unit, category and unit cost are not stored on a movement, so they are
// looked up from the material as it is now. Value is the quantity at the
// current unit cost, which is what the brief's inventory value report uses
// too; the system does not keep a price history, and the column says so.
// A material with no cost recorded gets both cells blank, never 0.

import { toDate } from './dom.js';
import { reasonLabel } from './reasons.js';
import { categoryLabel } from './format.js';
import { describeRange, shopToday, SHOP_TIME_ZONE } from './dates.js';

export const MOVEMENT_EXPORT_HEADER = [
  'Date and time',
  'Type',
  'Material',
  'Category',
  'Quantity',
  'Unit',
  'Reason',
  'Project',
  'Reference',
  'Notes',
  'Logged by',
  'Stock after',
];

export const MANAGER_EXPORT_COLUMNS = ['Unit cost', 'Value (at current cost)'];

const TYPE_LABELS = { in: 'Stock In', out: 'Stock Out', adjust: 'Adjustment' };

// "Nov 2, 2026, 3:04 PM" in Philippine time
export function exportDateTime(value) {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleString('en-US', {
    timeZone: SHOP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// The project of a stock-out saved before the project field existed sits
// in its reference, so it is shown under Project and not repeated
function projectAndReference(movement) {
  if (movement.project) return { project: movement.project, reference: movement.reference || '' };
  if (movement.type === 'out') return { project: movement.reference || '', reference: '' };
  return { project: '', reference: movement.reference || '' };
}

// materialsById: Map of id to material ({ category, unit })
// costsById: Map of id to { costPerUnit }, only passed for managers
export function movementExportRows(movements, { materialsById = new Map(), costsById = null } = {}) {
  const header = costsById ? [...MOVEMENT_EXPORT_HEADER, ...MANAGER_EXPORT_COLUMNS] : MOVEMENT_EXPORT_HEADER;

  const rows = movements.map((movement) => {
    const material = materialsById.get(movement.materialId);
    const quantity = Number(movement.quantity) || 0;
    const { project, reference } = projectAndReference(movement);

    const row = [
      exportDateTime(movement.createdAt || movement.movementDate),
      TYPE_LABELS[movement.type] || movement.type || '',
      movement.materialName || '',
      categoryLabel(material?.category || ''),
      quantity,
      material?.unit || '',
      movement.reason ? reasonLabel(movement.reason) : '',
      project,
      reference,
      movement.notes || '',
      movement.loggedByName || 'Deleted user',
      movement.afterQty === undefined ? '' : Number(movement.afterQty),
    ];

    if (costsById) {
      // Number(null) is 0, so an empty cost is checked for first
      const recorded = costsById.get(movement.materialId)?.costPerUnit;
      const cost = recorded === null || recorded === undefined || recorded === '' ? NaN : Number(recorded);
      const known = Number.isFinite(cost);
      row.push(known ? cost : '', known ? Math.round(cost * quantity * 100) / 100 : '');
    }

    return row;
  });

  return [header, ...rows];
}

// "Cornerblock Movement History – Nov 1 to Nov 2, 2026 – Nov 2, 2026", the
// range first and the day of the export last. A range open at one end
// keeps its "since" or "up to"; no dates at all reads "All time".
export function movementExportTitle(from, to, today = shopToday()) {
  const range = describeRange(from, to).replace(/^(from|on) /, '');
  const exported = describeRange(today, today).replace(/^on /, '');
  return `Cornerblock Movement History – ${range || 'All time'} – ${exported}`;
}
