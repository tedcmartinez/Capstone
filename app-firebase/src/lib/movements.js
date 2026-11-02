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
  increment,
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

// The reason lists live in reasons.js, which has no Firebase imports, so the
// data migration can read exactly the same lists. Re-exported here so the
// rest of the app keeps importing them from where it always has.
export {
  allowedReasons,
  REASON_LABELS,
  reasonLabel,
  projectKey,
  missingRequirements,
} from './reasons.js';
import { reasonLabel, projectKey, missingRequirements } from './reasons.js';

// The three kinds of movement, as the history and the reports label them
export const MOVEMENT_TYPES = ['in', 'out', 'adjust'];

export function movementTypeLabel(type) {
  return { in: 'IN', out: 'OUT', adjust: 'ADJUST' }[type] || type;
}

// ============================================================
// LOGGING A MOVEMENT
//
// Stock-in and stock-out are recorded as a RELATIVE change. The material's
// quantity is updated with increment(), not by writing a figure the browser
// worked out, and firestore.rules checks the size of that change against
// the live value at the moment it lands.
//
// This is what makes offline entry work properly. An entry typed while the
// office connection is down is a statement about what physically happened:
// twenty planks were taken. It stays true no matter what the total was when
// it was written, or what else has been recorded since. Two withdrawals of
// five, both typed against a total of eighteen, correctly leave eight.
//
// beforeQty and afterQty are still written, but only as a record of what
// the person was looking at when they entered it. The interface labels them
// that way, because on a late-syncing entry they are the device's view of
// the moment, not the arithmetic the server performed.
//
// The one rejection left is a stock-out that would take the total below
// zero, which the rules refuse. If that happens to an entry already
// reported as saved, it appears in the failed-sync bar: see lib/sync.js.
//
// Adjustments are different and are handled by adjustStock() below.
// ============================================================

export async function logMovement({ type, material, quantity, reason, reference, notes, project, receipt }) {
  const user = currentUser();

  // The same requirements the rules enforce, checked before anything is
  // written. A movement that would be refused must never be queued offline,
  // because the refusal would only surface later, after the person has
  // moved on. See missingRequirements() in reasons.js.
  const missing = Object.values(
    missingRequirements({ type, reason, project, notes, hasReceipt: Boolean(receipt) })
  );
  if (missing.length > 0) throw new Error(missing[0]);

  const amount = Number(quantity);
  const beforeQty = Number(material.stockQuantity) || 0;
  const afterQty = type === 'in' ? beforeQty + amount : beforeQty - amount;

  // Checked here so the user gets a sentence rather than a permission error.
  // This is the figure on their screen, which may be behind the server, so
  // it is a courtesy rather than the safeguard: the rules check the real
  // value when the write lands, and theirs is the one that counts.
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

    // Which job a stock-out went to. projectKey is the same text in the
    // form the history's project filter searches on. Stock-ins have none.
    project: type === 'out' ? String(project || '').trim() : '',
    projectKey: type === 'out' ? projectKey(project) : '',

    receiptId: receiptRef ? receiptRef.id : null,

    loggedBy: user.uid,
    loggedByName: user.name,
    createdAt: serverTimestamp(),
  };

  ops.push({ type: 'set', collection: 'stock_movements', id: movementId, data: movement });

  // The running total, applied as a change rather than as a figure.
  //
  // increment() is resolved by the server against whatever the value is when
  // the write lands, so this is correct even if the entry was made against a
  // total that has since moved. The rules see the resolved result and check
  // that it moved by exactly this movement's quantity and did not go below
  // zero.
  //
  // lastMovementId names the movement that justifies the change, which is
  // what stops a quantity being rewritten with no movement filed to explain
  // it.
  ops.push({
    type: 'update',
    collection: 'materials',
    id: material.id,
    data: {
      stockQuantity: increment(type === 'in' ? amount : -amount),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
      lastMovementId: movementId,
    },
  });

  if (receiptRef) ops.push(receiptRef.op);

  const summary = movementSummary({
    type,
    amount,
    material,
    reason,
    reference: type === 'out' ? movement.project : reference,
  });

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
      materialId: material.id,
      before: { stockQuantity: beforeQty },
      // A receipt is stored in the same batch as its stock-in, so it is
      // recorded in this entry rather than in one of its own. One write,
      // one record: there is no moment where the movement exists and the
      // receipt does not, so there is nothing a second entry would add.
      after: receiptRef
        ? { stockQuantity: afterQty, receiptId: receiptRef.id }
        : { stockQuantity: afterQty },
      summary: receiptRef ? `${summary}, with receipt attached` : summary,
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
// ADJUSTING A COUNT
//
// The manager has counted the shelf and the total is now whatever they
// counted, regardless of what the recorded movements add up to. This is how
// a real discrepancy gets corrected: breakage nobody logged, an offcut used
// without a slip, a miscount on delivery.
//
// It is treated as the opposite of a stock-in or stock-out in two ways.
//
// It is ABSOLUTE, so the figure the manager was looking at has to still be
// the figure on the server. If something moved while they were counting,
// their count is already out of date and writing it would silently discard
// that movement. The rules refuse it and the manager counts again.
//
// And it needs a connection, for the same reason. An adjustment typed
// offline and synced an hour later would be a count of a shelf as it was an
// hour ago. The rules refuse those too, and the failed-sync bar says so.
//
// Manager and webmaster only, enforced in the rules, not merely by hiding
// the button.
// ============================================================

export async function adjustStock({ material, countedQuantity, reason, notes }) {
  const user = currentUser();

  const beforeQty = Number(material.stockQuantity) || 0;
  const afterQty = Number(countedQuantity);
  const difference = afterQty - beforeQty;

  if (!Number.isInteger(afterQty) || afterQty < 0) {
    throw new Error('The counted quantity must be a whole number, zero or more.');
  }
  if (difference === 0) {
    throw new Error(
      `The counted quantity is already ${beforeQty} ${material.unit}, so there is nothing to adjust.`
    );
  }
  if (!reason) {
    throw new Error('Please give a reason for the adjustment.');
  }

  const movementId = newDocId('stock_movements');

  const movement = {
    materialId: material.id,
    materialName: material.name,
    type: 'adjust',
    // The size of the change, so totals and the history read the same way
    // as for any other movement
    quantity: Math.abs(difference),
    difference,
    beforeQty,
    afterQty,
    movementDate: todayIso(),
    reason,
    reference: '',
    notes: notes || '',
    receiptId: null,
    loggedBy: user.uid,
    loggedByName: user.name,
    createdAt: serverTimestamp(),
  };

  const ops = [
    { type: 'set', collection: 'stock_movements', id: movementId, data: movement },
    {
      type: 'update',
      collection: 'materials',
      id: material.id,
      data: {
        // Written as the counted figure, not as a change. An adjustment is
        // the manager overriding the total, so an increment would be the
        // wrong shape entirely.
        stockQuantity: afterQty,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        lastMovementId: movementId,
      },
    },
  ];

  const direction = difference > 0 ? 'up' : 'down';
  const summary =
    `Adjusted ${material.name} ${direction} from ${beforeQty} to ${afterQty} ` +
    `${material.unit} (${reasonLabel(reason)})`;

  const { status } = await auditedWrite(
    ops,
    {
      action: 'stock.adjust',
      entity: 'stock_movements',
      entityId: movementId,
      materialId: material.id,
      before: { stockQuantity: beforeQty },
      after: { stockQuantity: afterQty },
      summary,
    },
    { track: summary }
  );

  return { movementId, beforeQty, afterQty, difference, status };
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
// An adjustment is counted by the direction it moved the total, so the net
// figure still describes what happened to the stock. Its own tally is kept
// separate, because an adjustment is not a delivery or a withdrawal and
// adding it to either would misrepresent both.
export function movementTotals(movements) {
  let totalIn = 0;
  let totalOut = 0;
  let adjustedUp = 0;
  let adjustedDown = 0;

  for (const movement of movements) {
    const amount = Number(movement.quantity) || 0;

    if (movement.type === 'in') {
      totalIn += amount;
    } else if (movement.type === 'out') {
      totalOut += amount;
    } else if (movement.type === 'adjust') {
      const difference = Number(movement.difference) || 0;
      if (difference > 0) adjustedUp += difference;
      else adjustedDown += -difference;
    }
  }

  return {
    totalIn,
    totalOut,
    adjustedUp,
    adjustedDown,
    adjustmentCount: movements.filter((m) => m.type === 'adjust').length,
    net: totalIn - totalOut + adjustedUp - adjustedDown,
  };
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

    // Only real deliveries and withdrawals are charted. An adjustment is a
    // correction to the record rather than material moving through the
    // shop, and plotting it as a withdrawal would invent activity.
    if (movement.type === 'in') entry.in += amount;
    else if (movement.type === 'out') entry.out += amount;
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
export function validateMovement({ materialId, quantity, type, material, reason, project, notes, hasReceipt }) {
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

  errors.push(...Object.values(missingRequirements({ type, reason, project, notes, hasReceipt })));

  return errors;
}

// ============================================================
// PROJECT SUGGESTIONS
//
// The projects named on recent stock-outs, most recent first, one entry
// per project. Offered as suggestions in the Project field and in the
// history's Project filter, so "Sofa set for Ms. Reyes" is typed the same
// way every time, which keeps the filter and the reports useful. A new
// project can still be typed.
//
// Stock-outs saved before the project field existed kept the project in
// reference, so those are read too.
// ============================================================

const PROJECT_SUGGESTION_SCAN = 300;

export function projectOf(movement) {
  if (movement.project) return movement.project;
  return movement.type === 'out' ? movement.reference || '' : '';
}

export function distinctProjects(movements) {
  const seen = new Set();
  const projects = [];

  for (const movement of movements) {
    const name = String(projectOf(movement) || '').trim();
    const key = projectKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    projects.push(name);
  }

  return projects;
}

export async function loadProjectSuggestions() {
  const snapshot = await getDocs(
    query(
      collection(db, 'stock_movements'),
      where('type', '==', 'out'),
      // Ordered the way the history is, which uses an index that exists
      // already (type, movementDate, createdAt)
      orderBy('movementDate', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(PROJECT_SUGGESTION_SCAN)
    )
  );
  return distinctProjects(snapshot.docs.map((d) => d.data()));
}
