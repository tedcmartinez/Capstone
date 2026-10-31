// Stock movements: data access
//
// Replaces app/models/StockMovement.php and the logging half of
// MovementController.php.

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { auditedWrite, newDocId } from './audit.js';
import { currentUser } from './session.js';
import { todayIso, toDate } from './dom.js';
import { receiptOperation } from './receipts.js';
import { PAGE_SIZE } from './config.js';

// ============================================================
// REASONS
//
// Ported from MovementController::allowedReasons(). The lists are exactly
// the ones the old forms offered, so the wording in existing records still
// matches what a new record can say.
// ============================================================

export function allowedReasons(type) {
  if (type === 'in') return ['Purchase', 'Restock', 'Return', 'Correction'];
  return ['Project Usage', 'Damaged', 'Transfer', 'Other'];
}

// The dropdown showed "Stock Correction" while storing "Correction"
export const REASON_LABELS = {
  Correction: 'Stock Correction',
};

export function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason;
}

// ============================================================
// LOGGING A MOVEMENT
//
// A deliberate difference from the brief, and the one trade-off in this
// migration worth stating plainly.
//
// The brief asked for a transaction: read the material, check the result is
// not negative, write the movement and the new quantity together. A
// Firestore transaction does exactly that, but it requires a live
// connection and will not queue offline, which would mean the shop cannot
// log a withdrawal whenever the office internet drops. That is acceptance
// test 17, and it is the more important of the two.
//
// So this uses a batch, which does queue offline, and the checking that a
// transaction would have done is moved into firestore.rules instead:
//
//   1. beforeQty must equal the quantity the server actually holds at the
//      moment the batch is applied. This is the important one. It means a
//      movement calculated from an out-of-date copy of the material is
//      refused rather than written, so a stale figure cannot produce a
//      wrong total. Two people working from the same starting number
//      cannot both succeed: the first moves the server's value and the
//      second no longer matches it.
//   2. The arithmetic must hold: afterQty must be beforeQty plus the
//      quantity for a stock-in, or minus it for a stock-out, and the
//      material must be left holding exactly afterQty.
//   3. afterQty may not be negative, which is what stops a withdrawal
//      larger than the stock on hand.
//   4. A material's quantity may not change at all except through a
//      movement created in the same batch, so no figure can be rewritten
//      without a record of who moved what.
//
// The alert email is sent by the Apps Script, which reads the real quantity
// from Firestore rather than believing anything sent from here.
//
// What this still gives up compared with a transaction: a refused write is
// discovered after the fact rather than retried automatically. An entry
// typed offline against a figure that has since moved will be rejected when
// it finally reaches the server, and has to be entered again. The user is
// told, by name, which entry failed and why: see lib/sync.js.
// ============================================================

export async function logMovement({ type, material, quantity, reason, reference, notes, receipt }) {
  const user = currentUser();

  const amount = Number(quantity);
  const beforeQty = Number(material.stockQuantity) || 0;
  const afterQty = type === 'in' ? beforeQty + amount : beforeQty - amount;

  // Checked here so the user gets a sentence rather than a permission error.
  // The rules check it again, and theirs is the one that counts.
  if (afterQty < 0) {
    throw new Error(
      `Cannot remove more than the ${beforeQty} ${material.unit} currently in stock.`
    );
  }

  const movementId = newDocId('stock_movements');

  // The receipt, when there is one, is written in the same batch so it can
  // never exist without its movement.
  let receiptRef = null;
  const ops = [];

  if (receipt && type === 'in') {
    receiptRef = receiptOperation(receipt, movementId);
  }

  const movement = {
    materialId: material.id,
    materialName: material.name,
    type,
    quantity: amount,
    beforeQty,
    afterQty,

    // The date is stamped here rather than taken from a form field, which
    // is what the PHP version did deliberately: "It is not taken from the
    // form, so it cannot be changed or backdated by the user." The form
    // shows today's date as read-only text for the same reason.
    movementDate: todayIso(),

    reason: reason || '',
    reference: reference || '',
    notes: notes || '',
    receiptId: receiptRef ? receiptRef.id : null,

    loggedBy: user.uid,
    loggedByName: user.name,
    createdAt: serverTimestamp(),
  };

  ops.push({ type: 'set', collection: 'stock_movements', id: movementId, data: movement });

  // The running total on the material. This is the only field a movement
  // may change on a material, and a movement is the only thing that may
  // change it at all.
  //
  // lastMovementId names the movement that justifies the new figure. The
  // rules read it to check that a matching movement is being created in this
  // same batch, that it started from the quantity the server currently
  // holds, and that its arithmetic is right. Without it a quantity could be
  // rewritten with no movement filed to explain it.
  ops.push({
    type: 'update',
    collection: 'materials',
    id: material.id,
    data: {
      stockQuantity: afterQty,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
      lastMovementId: movementId,
    },
  });

  if (receiptRef) ops.push(receiptRef.op);

  const summary = movementSummary({ type, amount, material, reason, reference });

  // Tracked rather than simply awaited. If the server answers promptly the
  // user gets the usual immediate confirmation, and a refusal is thrown here
  // so the form can show the real reason. If it does not answer, which is
  // what happens when the office connection is down, the entry is reported
  // as queued and followed in the background, so nobody is left waiting on
  // a frozen button and nothing fails without being noticed.
  const { status } = await auditedWrite(
    ops,
    {
      action: type === 'in' ? 'stock.in' : 'stock.out',
      entity: 'stock_movements',
      entityId: movementId,
      before: { stockQuantity: beforeQty },
      after: { stockQuantity: afterQty },
      summary,
    },
    { track: summary }
  );

  return {
    movementId,
    receiptId: receiptRef?.id || null,
    beforeQty,
    afterQty,
    status,
  };
}

// "Stock out 20 pcs, Mahogany Plank (Project Usage: order #102)", the shape
// the brief asked for: readable on its own, without looking anything up.
function movementSummary({ type, amount, material, reason, reference }) {
  const direction = type === 'in' ? 'Stock in' : 'Stock out';
  const detail = [reasonLabel(reason), reference].filter(Boolean).join(': ');

  return (
    `${direction} ${amount} ${material.unit}, ${material.name}` +
    (detail ? ` (${detail})` : '')
  );
}

// ============================================================
// READING
//
// Movement history grows for as long as the shop uses the system, so unlike
// the materials catalog it is read a page at a time rather than all at once.
// The filters are applied by Firestore, using the composite indexes in
// firestore.indexes.json: equality filters first, then the date range on
// movementDate, which is also the field the results are ordered by.
// ============================================================

export async function loadMovements({ type, materialId, dateFrom, dateTo, cursor } = {}) {
  const clauses = [];

  if (type === 'in' || type === 'out') clauses.push(where('type', '==', type));
  if (materialId) clauses.push(where('materialId', '==', materialId));
  if (dateFrom) clauses.push(where('movementDate', '>=', dateFrom));
  if (dateTo) clauses.push(where('movementDate', '<=', dateTo));

  // Newest first, the order the PHP page used. createdAt breaks ties within
  // a day, so several movements on the same date keep a stable order.
  const ordering = [orderBy('movementDate', 'desc'), orderBy('createdAt', 'desc')];

  // One extra row is requested so the caller can tell whether another page
  // exists without running a separate count query.
  const pageQuery = cursor
    ? query(collection(db, 'stock_movements'), ...clauses, ...ordering, startAfter(cursor), limit(PAGE_SIZE + 1))
    : query(collection(db, 'stock_movements'), ...clauses, ...ordering, limit(PAGE_SIZE + 1));

  const snapshot = await getDocs(pageQuery);
  const docs = snapshot.docs;

  const hasMore = docs.length > PAGE_SIZE;
  const page = hasMore ? docs.slice(0, PAGE_SIZE) : docs;

  return {
    movements: page.map((d) => ({ id: d.id, ...d.data() })),
    hasMore,
    // Passed back in to fetch the following page
    lastDoc: page.length > 0 ? page[page.length - 1] : null,
  };
}

// The most recent N movements, for the dashboard's recent activity list.
// Ported from StockMovement::getRecent().
export async function loadRecentMovements(count = 8) {
  const snapshot = await getDocs(
    query(
      collection(db, 'stock_movements'),
      orderBy('movementDate', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(count)
    )
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Every movement in a date range, for the movement report and the dashboard
// chart. Ported from getFiltered() and getDailyTotals().
export async function loadMovementsInRange(dateFrom, dateTo) {
  const snapshot = await getDocs(
    query(
      collection(db, 'stock_movements'),
      where('movementDate', '>=', dateFrom),
      where('movementDate', '<=', dateTo),
      orderBy('movementDate', 'desc'),
      orderBy('createdAt', 'desc')
    )
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================================================
// SUMMARIES
// ============================================================

// Totals in and out across a list of movements, for the strip of figures
// above the history table.
export function movementTotals(movements) {
  let totalIn = 0;
  let totalOut = 0;

  for (const movement of movements) {
    const amount = Number(movement.quantity) || 0;
    if (movement.type === 'in') totalIn += amount;
    else totalOut += amount;
  }

  return { totalIn, totalOut, net: totalIn - totalOut };
}

// Quantity moved in and out per day over the last N days, including days
// with no activity so the chart shows an even timeline rather than skipping
// dates. Ported from StockMovement::getDailyTotals().
export function dailyTotals(movements, days) {
  const byDate = new Map();

  for (const movement of movements) {
    const key = movement.movementDate;
    if (!byDate.has(key)) byDate.set(key, { in: 0, out: 0 });

    const entry = byDate.get(key);
    const amount = Number(movement.quantity) || 0;
    if (movement.type === 'in') entry.in += amount;
    else entry.out += amount;
  }

  // Walking backwards from today, filling in zeros for quiet days
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const key = `${date.getFullYear()}-${month}-${day}`;

    series.push({
      date: key,
      in: byDate.get(key)?.in || 0,
      out: byDate.get(key)?.out || 0,
    });
  }

  return series;
}

// The first date to request for a chart covering the last N days
export function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// ============================================================
// SORTING WITHIN A PAGE
//
// The history is ordered by date on the server, because that is what can be
// indexed alongside the filters. The other columns sort the rows already on
// screen, which is what the PHP version did for every column: it sorted the
// result set in memory with usort() rather than in SQL.
// ============================================================

export function sortMovementsInPage(movements, sort, direction) {
  const keys = {
    materialName: (m) => (m.materialName || '').toLowerCase(),
    type: (m) => m.type || '',
    quantity: (m) => Number(m.quantity) || 0,
    movementDate: (m) => m.movementDate || '',
    loggedByName: (m) => (m.loggedByName || '').toLowerCase(),
  };
  const read = keys[sort] || keys.movementDate;

  const sorted = [...movements].sort((a, b) => {
    const left = read(a);
    const right = read(b);
    if (left < right) return -1;
    if (left > right) return 1;

    // Within the same value, keep the newest first so the order is stable
    const aTime = toDate(a.createdAt)?.getTime() || 0;
    const bTime = toDate(b.createdAt)?.getTime() || 0;
    return bTime - aTime;
  });

  return direction === 'desc' ? sorted.reverse() : sorted;
}

// Validation shared by the stock-in and stock-out forms, ported from
// MovementController::logMovement().
export function validateMovement({ materialId, quantity, type, material }) {
  const errors = [];

  if (!materialId) errors.push('Please select a material.');

  if (!/^\d+$/.test(String(quantity).trim()) || Number(quantity) <= 0) {
    errors.push('Quantity must be a whole number greater than zero.');
  } else if (type === 'out' && material) {
    const onHand = Number(material.stockQuantity) || 0;
    if (Number(quantity) > onHand) {
      errors.push(`Cannot remove more than the ${onHand} ${material.unit} currently in stock.`);
    }
  }

  return errors;
}
