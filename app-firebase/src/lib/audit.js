// The audit trail
//
// Every write in this system goes through auditedWrite(). That is not a
// convention anyone has to remember: firestore.rules refuses a write unless
// it arrives with a brand new audit_logs entry in the same batch, so a
// change made without going through here is rejected by the server.
//
// How it works:
//   1. A document id for the log entry is generated locally, before writing
//      anything. Firestore can mint an id client-side, so the id is known in
//      advance and nothing has to be written twice.
//   2. That id is stamped onto every document the operation changes, as
//      lastAuditId, which is how a record points at the entry explaining its
//      current state.
//   3. The data changes and the log entry are committed together in one
//      batch, so either all of it lands or none of it does. There is no
//      window where stock has moved but the trail does not say who moved it.

import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { APP_VERSION } from './config.js';
import { currentUser } from './session.js';
import { settleOrQueue, CONFIRMED } from './sync.js';

// ============================================================
// IDS
// ============================================================

// A Firestore document id generated in the browser. doc() with no path
// builds a reference without contacting the server, so this works offline
// as well, which matters because a stock movement may be logged while the
// office connection is down.
export function newAuditId() {
  return doc(collection(db, 'audit_logs')).id;
}

export function newDocId(collectionName) {
  return doc(collection(db, collectionName)).id;
}

// ============================================================
// THE LOG ENTRY
// ============================================================

// Fills in who did it, when, and from which version of the app, so a page
// only has to describe what happened.
//
// The timestamp must be serverTimestamp(). The rules compare it against
// request.time, the server's own clock, so a browser with a wrong or
// deliberately altered clock cannot date an entry to suit itself.
function buildEntry(entry) {
  const actor = entry.actor || currentUser();

  return {
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,

    actorUid: actor?.uid ?? null,
    actorEmail: actor?.email ?? null,
    actorName: actor?.name ?? null,
    actorRole: actor?.role ?? null,

    // Only the fields that actually changed, not whole documents, so the
    // trail stays readable and the entry stays small.
    before: entry.before ?? null,
    after: entry.after ?? null,

    summary: entry.summary ?? '',
    timestamp: serverTimestamp(),
    appVersion: APP_VERSION,
  };
}

// ============================================================
// THE AUDITED WRITE
// ============================================================

// ops is a list of document changes, each one:
//   { type: 'set' | 'merge' | 'update', collection: 'materials', id: 'abc',
//     data: { ... } }
//
// entry describes the change for the trail:
//   { action, entity, entityId, before, after, summary }
//
// Pass an empty ops list to record something that changes no document, which
// is how signing in and signing out are logged.
//
// Returns { auditId, status }.
//
// options.track, when given a description of the change, means the write is
// followed rather than waited on indefinitely. Stock movements use it,
// because they must be enterable while the office connection is down: see
// the explanation in lib/sync.js. status then says whether the server has
// confirmed the write or it is still queued.
//
// Without options.track the behaviour is unchanged: the write is awaited
// and a refusal is thrown to the caller.
export async function auditedWrite(ops, entry, options = {}) {
  const auditId = newAuditId();
  const batch = writeBatch(db);

  for (const op of ops) {
    const ref = doc(db, op.collection, op.id);
    const data = { ...op.data, lastAuditId: auditId };

    if (op.type === 'set') {
      batch.set(ref, data);
    } else if (op.type === 'merge') {
      batch.set(ref, data, { merge: true });
    } else if (op.type === 'update') {
      batch.update(ref, data);
    } else {
      throw new Error(`Unknown audited write type: ${op.type}`);
    }
  }

  batch.set(doc(db, 'audit_logs', auditId), buildEntry(entry));

  if (options.track) {
    const outcome = await settleOrQueue(batch.commit(), options.track);
    return { auditId, status: outcome.status };
  }

  await batch.commit();
  return { auditId, status: CONFIRMED };
}

// ============================================================
// CHANGE COMPARISON
// ============================================================

// Works out which fields actually changed between two versions of a record,
// and returns them as a before and after pair holding only those fields.
// An edit that touched one field produces an entry naming one field, which
// is what makes the before and after diff on the audit page readable.
export function diffFields(before, after, fields) {
  const changedBefore = {};
  const changedAfter = {};

  for (const field of fields) {
    const oldValue = before?.[field] ?? null;
    const newValue = after?.[field] ?? null;
    if (String(oldValue) !== String(newValue)) {
      changedBefore[field] = oldValue;
      changedAfter[field] = newValue;
    }
  }

  return {
    before: Object.keys(changedBefore).length ? changedBefore : null,
    after: Object.keys(changedAfter).length ? changedAfter : null,
    hasChanges: Object.keys(changedAfter).length > 0,
  };
}
