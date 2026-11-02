// Write tracking, so a failed save is never silent
//
// A correction to how I first described this. batch.commit() does not
// resolve when the write reaches the local cache: it resolves when Google
// acknowledges it, and while the browser is offline it does not resolve at
// all. Local listeners update straight away, which is why the screen looks
// right immediately, but the promise stays pending.
//
// That leaves two problems, and this module exists for both:
//
//   1. Waiting on the promise would freeze the form on "Saving..." for as
//      long as the office internet is down, which defeats the whole point
//      of being able to log a withdrawal offline.
//
//   2. Not waiting on it means a write the server later refuses would fail
//      with nobody told, after the user has already seen a confirmation.
//      A stock withdrawal that quietly did not happen is worse than one
//      that visibly failed.
//
// So a write is given a short window to confirm. If it confirms, the user
// gets the usual immediate answer. If it does not, the save is reported as
// queued and the promise is followed in the background. Should it then be
// refused, the failure is recorded and the interface says so plainly,
// naming what has to be entered again.

export const CONFIRMED = 'confirmed';
export const QUEUED = 'queued';

// How long to wait for the server before calling a write queued. Long
// enough that a normal save on a slow connection still confirms, short
// enough that nobody is left staring at a button.
const CONFIRM_TIMEOUT_MS = 4000;

// Writes still waiting on the server, and writes the server refused
const pending = new Map();
const failures = [];

let nextId = 1;
const listeners = new Set();

// ============================================================
// SUBSCRIBING
// ============================================================

// The shell subscribes so the banner can appear the moment a write fails,
// without the page it happened on having to still be open.
export function onSyncChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  const snapshot = { pending: pendingList(), failures: [...failures] };
  for (const listener of listeners) listener(snapshot);
}

export function pendingList() {
  return [...pending.values()];
}

export function pendingCount() {
  return pending.size;
}

export function failureList() {
  return [...failures];
}

export function failureCount() {
  return failures.length;
}

export function dismissFailure(id) {
  const index = failures.findIndex((failure) => failure.id === id);
  if (index !== -1) {
    failures.splice(index, 1);
    notify();
  }
}

export function dismissAllFailures() {
  failures.length = 0;
  notify();
}

// ============================================================
// TRACKING A WRITE
// ============================================================

// Waits a short while for the write to be acknowledged.
//
// Returns { status: CONFIRMED } when the server took it, or
// { status: QUEUED, id } when the window passed with no answer. A rejection
// inside the window is thrown, so the caller can show the real reason while
// the user is still looking at the form.
//
// description is what the failure notice will say has to be re-entered, so
// it should name the actual thing: "Stock out 20 pcs, Mahogany Plank".
export async function settleOrQueue(promise, description) {
  const id = nextId;
  nextId += 1;

  // Any rejection is caught here as well as below, so a refusal arriving
  // after the window never becomes an unhandled rejection.
  let settled = false;

  const tracked = promise.then(
    () => {
      settled = true;
      return { ok: true };
    },
    (error) => {
      settled = true;
      return { ok: false, error };
    }
  );

  const raced = await Promise.race([
    tracked,
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), CONFIRM_TIMEOUT_MS)),
  ]);

  if (raced.timedOut) {
    // Still unanswered. The change is in the local cache and on screen, so
    // the user is told it is saved and syncing, and the promise is followed
    // from here.
    pending.set(id, { id, description, since: new Date() });
    notify();

    tracked.then((result) => {
      pending.delete(id);

      if (!result.ok) {
        recordFailure(id, description, result.error);
      } else {
        notify();
      }
    });

    return { status: QUEUED, id };
  }

  if (!raced.ok) throw raced.error;

  return { status: CONFIRMED, id };
}

function recordFailure(id, description, error) {
  failures.push({
    id,
    description,
    at: new Date(),
    reason: reasonFor(error),
  });
  notify();
}

// Why a queued write was refused, in words the shop can act on.
//
// The most likely reason by far is the stale quantity check: the entry was
// typed while offline, somebody else moved the same material in the
// meantime, and the server refused a figure that no longer matched. The
// movement genuinely did not happen and has to be entered again.
function reasonFor(error) {
  const code = error?.code || '';
  const text = String(error?.message || error || '');

  if (code === 'permission-denied' || /permission|insufficient/i.test(text)) {
    return (
      'The stock figure had already changed, so the server refused this entry ' +
      'to avoid recording a wrong total.'
    );
  }

  if (code === 'unavailable' || /offline|unavailable/i.test(text)) {
    return 'The connection was lost before the server accepted it.';
  }

  return text || 'The server refused the write.';
}

// Exposed for the tests, which need the tracker to start from nothing
export function resetSyncState() {
  pending.clear();
  failures.length = 0;
  nextId = 1;
  notify();
}
