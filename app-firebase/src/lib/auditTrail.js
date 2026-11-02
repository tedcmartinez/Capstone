// The audit trail: reading, filtering and exporting
//
// lib/audit.js writes the trail. This module reads it back, for the Audit
// Trail page and for the export to Google Sheets or CSV.
//
// Manager and webmaster only. firestore.rules lets nobody else read
// audit_logs, and lets nobody at all change or delete an entry, the
// webmaster included, so what this module reads is exactly what was written.

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { PAGE_SIZE, ROLE_LABELS } from './config.js';
import { toDate } from './dom.js';
import { startOfShopDay, endOfShopDay } from './dates.js';

// ============================================================
// ACTIONS
// Every action the system records, grouped the way the filter shows them,
// with the wording a manager reads instead of the code stored.
// ============================================================

export const AUDIT_ACTION_GROUPS = [
  {
    label: 'Stock',
    actions: {
      'stock.in': 'Stock in',
      'stock.out': 'Stock out',
      'stock.adjust': 'Stock adjustment',
    },
  },
  {
    label: 'Catalog',
    actions: {
      'material.create': 'Material added',
      'material.update': 'Material edited',
      'material.archive': 'Material archived',
      'material_cost.update': 'Cost or supplier changed',
      'supplier.create': 'Supplier added',
      'supplier.update': 'Supplier edited',
      'supplier.archive': 'Supplier archived',
    },
  },
  {
    label: 'Accounts',
    actions: {
      'user.register': 'Account registered',
      'user.approve': 'Account approved',
      'user.reject': 'Registration rejected',
      'user.role_change': 'Role changed',
      'user.disable': 'Account disabled',
      'user.delete': 'Account deleted',
      'user.verify_email': 'Email verified',
      'auth.login': 'Signed in',
      'auth.logout': 'Signed out',
    },
  },
  {
    label: 'System',
    actions: {
      'checklist.send': 'Reorder checklist sent',
      'audit.export': 'Audit trail exported',
      'movements.export': 'Movement history exported',
      'data.migrate': 'Data migrated',
    },
  },
];

const ACTION_LABELS = Object.assign({}, ...AUDIT_ACTION_GROUPS.map((group) => group.actions));

export function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

export function isKnownAction(action) {
  return Object.prototype.hasOwnProperty.call(ACTION_LABELS, action);
}

// ============================================================
// QUERYING
//
// Every filter is applied by Firestore rather than in the browser, because
// the trail grows for as long as the shop uses the system and is read a page
// at a time. A filter applied after paging would leave pages half empty and
// make "page 3 of the stock-outs" meaningless.
//
// The equality filters go first, always in the same order, then the date
// range on timestamp, which is also the ordering. Each combination has its
// own composite index in firestore.indexes.json.
// ============================================================

// A category is a set of materials, so it is filtered with "in" on
// materialId, which uses the same indexes as a single material. Firestore
// allows at most 30 values in one "in"; a category larger than that is
// checked in the browser instead (see loadAuditPage).
export const IN_LIMIT = 30;

function clausesFor({ actorUid, action, materialId, materialIds, dateFrom, dateTo }) {
  const clauses = [];

  if (actorUid) clauses.push(where('actorUid', '==', actorUid));
  if (action) clauses.push(where('action', '==', action));
  if (materialId) {
    clauses.push(where('materialId', '==', materialId));
  } else if (materialIds && materialIds.length > 0 && materialIds.length <= IN_LIMIT) {
    clauses.push(where('materialId', 'in', materialIds));
  }

  // Whole days in the shop's own time: From is midnight Philippine time,
  // and To runs to 11:59:59 PM on its day, whatever timezone the computer
  // reading the trail is set to.
  if (dateFrom) clauses.push(where('timestamp', '>=', Timestamp.fromDate(startOfShopDay(dateFrom))));
  if (dateTo) clauses.push(where('timestamp', '<=', Timestamp.fromDate(endOfShopDay(dateTo))));

  return clauses;
}

// A YYYY-MM-DD date as a Date at local midnight, for the export title
function startOfDay(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

// The part of a category filter Firestore could not take, as a check on
// each entry, or null when the query covers everything
function browserCheck({ materialId, materialIds }) {
  if (materialId || !materialIds || materialIds.length <= IN_LIMIT) return null;
  const wanted = new Set(materialIds);
  return (entry) => wanted.has(entry.materialId);
}

// A category with no materials matches nothing, and an empty "in" is an
// error in Firestore, so that case never reaches a query
function matchesNothing({ materialId, materialIds }) {
  return !materialId && Array.isArray(materialIds) && materialIds.length === 0;
}

// One page of the trail, newest first. One extra entry is requested so the
// caller can tell whether another page exists without a separate count.
export async function loadAuditPage(filters = {}, cursor = null) {
  if (matchesNothing(filters)) return { entries: [], hasMore: false, lastDoc: null };

  const check = browserCheck(filters);
  if (check) return scanAuditPage(filters, cursor, check);

  const parts = [
    ...clausesFor(filters),
    orderBy('timestamp', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(PAGE_SIZE + 1),
  ];

  const snapshot = await getDocs(query(collection(db, 'audit_logs'), ...parts));
  const docs = snapshot.docs;

  const hasMore = docs.length > PAGE_SIZE;
  const page = hasMore ? docs.slice(0, PAGE_SIZE) : docs;

  return {
    entries: page.map((d) => ({ id: d.id, ...d.data() })),
    hasMore,
    lastDoc: page.length > 0 ? page[page.length - 1] : null,
  };
}

// A page for a category too large for "in": reads in batches, keeps the
// entries about its materials, and stops at a full page or after 1,000
// entries read, whichever comes first, so the free read allowance is safe.
async function scanAuditPage(filters, cursor, check) {
  const kept = [];
  let position = cursor;
  let read = 0;

  while (read < 1000) {
    const snapshot = await getDocs(
      query(
        collection(db, 'audit_logs'),
        ...clausesFor(filters),
        orderBy('timestamp', 'desc'),
        ...(position ? [startAfter(position)] : []),
        limit(100)
      )
    );

    for (const d of snapshot.docs) {
      read += 1;
      position = d;
      const entry = { id: d.id, ...d.data() };
      if (!check(entry)) continue;
      kept.push({ entry, doc: d });
      if (kept.length > PAGE_SIZE) {
        const pageItems = kept.slice(0, PAGE_SIZE);
        return {
          entries: pageItems.map((item) => item.entry),
          hasMore: true,
          lastDoc: pageItems[pageItems.length - 1].doc,
        };
      }
    }

    if (snapshot.docs.length < 100) {
      return { entries: kept.map((item) => item.entry), hasMore: false, lastDoc: position };
    }
  }

  return { entries: kept.map((item) => item.entry), hasMore: true, lastDoc: position };
}

// Every entry matching the filters, for an export.
//
// The export has to contain all of the filtered rows, not only the page on
// screen, so this keeps reading until the results run out. It reads in
// large batches to keep the number of round trips down, and stops at a
// ceiling so a careless "export everything" on a trail years long cannot
// spend the day's free read allowance in one click. Reaching the ceiling
// is reported, never silently truncated.
const EXPORT_BATCH = 500;
export const EXPORT_CEILING = 10000;

export async function loadAllAudit(filters = {}, { onProgress } = {}) {
  if (matchesNothing(filters)) return { entries: [], truncated: false };

  const check = browserCheck(filters) || (() => true);
  const entries = [];
  let cursor = null;

  while (entries.length < EXPORT_CEILING) {
    const parts = [
      ...clausesFor(filters),
      orderBy('timestamp', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(EXPORT_BATCH),
    ];

    const snapshot = await getDocs(query(collection(db, 'audit_logs'), ...parts));
    for (const d of snapshot.docs) {
      const entry = { id: d.id, ...d.data() };
      if (check(entry)) entries.push(entry);
    }

    if (onProgress) onProgress(entries.length);

    if (snapshot.docs.length < EXPORT_BATCH) {
      return { entries, truncated: false };
    }
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  return { entries: entries.slice(0, EXPORT_CEILING), truncated: true };
}

// The people and materials the filter dropdowns offer.
//
// Archived materials are included on purpose. A material archived last month
// still has a history, and the audit trail is where somebody goes to look it
// up, so leaving it out of the filter would hide exactly the record that
// prompted the question.
export async function loadAuditFilterOptions() {
  const [usersSnapshot, materialsSnapshot] = await Promise.all([
    getDocs(query(collection(db, 'users'), orderBy('name'))),
    getDocs(collection(db, 'materials')),
  ]);

  const users = usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  const materials = materialsSnapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return { users, materials };
}

// ============================================================
// THE BEFORE AND AFTER DIFF
// ============================================================

// The labels a manager reads in place of the stored field names
const FIELD_LABELS = {
  name: 'Name',
  category: 'Category',
  size: 'Size',
  unit: 'Unit',
  notes: 'Notes',
  minThreshold: 'Minimum threshold',
  stockQuantity: 'Stock quantity',
  costPerUnit: 'Cost per unit',
  supplierId: 'Supplier record',
  supplierName: 'Supplier',
  viberContact: 'Viber contact',
  isArchived: 'Archived',
  role: 'Role',
  status: 'Account status',
  email: 'Email',
  provider: 'Sign-in method',
  receiptId: 'Receipt',
  destination: 'Exported to',
  rowCount: 'Rows exported',
  filters: 'Filters used',
  spreadsheetId: 'Spreadsheet',
};

export function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

// Writes a stored value the way a person would say it
export function formatValue(value, field = '') {
  if (value === null || value === undefined || value === '') return '(none)';

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (field === 'role') return ROLE_LABELS[value] || String(value);

  if (field === 'costPerUnit' && typeof value === 'number') {
    return `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Firestore Timestamp
  if (typeof value?.toDate === 'function') return formatTimestamp(value);

  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(', ');

  if (typeof value === 'object') {
    const parts = Object.entries(value)
      .filter(([, inner]) => inner !== null && inner !== undefined && inner !== '')
      .map(([key, inner]) => `${fieldLabel(key)}: ${formatValue(inner, key)}`);
    return parts.length > 0 ? parts.join('; ') : '(none)';
  }

  return String(value);
}

// Lines up before and after field by field, for the detail view. Every field
// mentioned on either side is listed, so a field that was added or cleared
// shows up rather than vanishing.
export function diffRows(before, after) {
  const fields = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];

  return fields.map((field) => {
    const oldValue = before ? before[field] : undefined;
    const newValue = after ? after[field] : undefined;

    return {
      field,
      label: fieldLabel(field),
      before: formatValue(oldValue, field),
      after: formatValue(newValue, field),
      changed: JSON.stringify(oldValue ?? null) !== JSON.stringify(newValue ?? null),
    };
  });
}

// A short, single line description of the change, for a table cell
export function describeSide(side) {
  if (!side || Object.keys(side).length === 0) return '';
  return formatValue(side);
}

// ============================================================
// EXPORT ROWS
// Shared by the Google Sheets export and the CSV fallback, so the two always
// carry the same columns in the same order.
// ============================================================

export const EXPORT_HEADER = [
  'Timestamp',
  'User',
  'Role',
  'Action',
  'Entity',
  'Record',
  'Summary',
  'Before',
  'After',
];

export function formatTimestamp(value) {
  const date = toDate(value);
  if (!date) return '';

  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function exportRows(entries) {
  return entries.map((entry) => [
    formatTimestamp(entry.timestamp),
    entry.actorEmail ? `${entry.actorName || ''} (${entry.actorEmail})`.trim() : entry.actorName || '',
    ROLE_LABELS[entry.actorRole] || entry.actorRole || '',
    actionLabel(entry.action),
    entry.entity || '',
    entry.entityId || '',
    entry.summary || '',
    describeSide(entry.before),
    describeSide(entry.after),
  ]);
}

// The title the brief asked for:
//   Cornerblock Audit Trail — {from} to {to} (exported {date})
export function exportTitle({ dateFrom, dateTo } = {}, now = new Date()) {
  const readable = (date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const from = dateFrom ? readable(startOfDay(dateFrom)) : 'earliest record';
  const to = dateTo ? readable(startOfDay(dateTo)) : readable(now);

  return `Cornerblock Audit Trail — ${from} to ${to} (exported ${readable(now)})`;
}

// ============================================================
// CSV
//
// The fallback for a manager who signed in with a password, or who declined
// to let the system create files in their Google Drive.
// ============================================================

// A cell beginning with one of these is read as a formula by Excel and by
// Google Sheets when a CSV is opened. The summaries contain text people
// typed, such as material names and notes, so a note beginning with "="
// could otherwise run as a formula on the manager's computer. Prefixing an
// apostrophe makes the cell plain text. This is the standard mitigation
// for what is known as CSV or formula injection.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);

  if (text && FORMULA_TRIGGERS.includes(text[0])) {
    text = `'${text}`;
  }

  // Quoted whenever it holds a comma, a quote or a line break, with quotes
  // doubled, which is what RFC 4180 requires
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function toCsv(rows) {
  // Windows line endings, because the file is most likely opened in Excel
  // on the shop desktop. The byte order mark tells Excel the file is UTF-8,
  // without which a peso sign or an accented name arrives garbled.
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

// The downloaded file's name. The spreadsheet title can be as readable as
// it likes, but a file name is kept to plain lowercase, digits and hyphens,
// with the dates in year-month-day order so a folder of exports sorts by
// date on its own.
export function exportFileName(filters, now = new Date()) {
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const range = [filters.dateFrom || 'start', filters.dateTo || 'today'].join('_to_');
  return `cornerblock-audit-trail_${range}_exported-${stamp}.csv`;
}

// The filters, described for the audit.export entry, so the trail records
// not just that an export happened but which slice of the trail it covered
export function describeFilters(filters, { users = [], materials = [] } = {}) {
  const described = {};

  if (filters.dateFrom) described.from = filters.dateFrom;
  if (filters.dateTo) described.to = filters.dateTo;
  if (filters.actorUid) {
    const user = users.find((u) => u.id === filters.actorUid);
    described.user = user ? `${user.name} (${user.email})` : filters.actorUid;
  }
  if (filters.action) described.action = actionLabel(filters.action);
  if (filters.category) described.category = filters.categoryLabel || filters.category;
  if (filters.materialId) {
    const material = materials.find((m) => m.id === filters.materialId);
    described.material = material ? material.name : filters.materialId;
  }

  return described;
}
