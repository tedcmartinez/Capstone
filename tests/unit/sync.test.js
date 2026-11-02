// The write tracker
//
// What matters here is that a write which looked saved and was then refused
// cannot vanish. Every path through settleOrQueue() either throws to the
// caller, so the form shows the reason, or records a failure the banner
// will display.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  settleOrQueue,
  onSyncChange,
  failureList,
  failureCount,
  pendingCount,
  dismissFailure,
  dismissAllFailures,
  resetSyncState,
  CONFIRMED,
  QUEUED,
} from '../../app-firebase/src/lib/sync.js';

// A promise that can be settled by the test, standing in for a commit that
// the server has not answered yet
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const permissionDenied = () => {
  const error = new Error('Missing or insufficient permissions.');
  error.code = 'permission-denied';
  return error;
};

beforeEach(() => {
  resetSyncState();
  vi.useRealTimers();
});

// ============================================================
// A WRITE THE SERVER ANSWERS PROMPTLY
// ============================================================

describe('a write the server confirms', () => {
  it('reports it as confirmed', async () => {
    const outcome = await settleOrQueue(Promise.resolve(), 'Stock in 50 pcs, Narra Lumber');

    expect(outcome.status).toBe(CONFIRMED);
    expect(pendingCount()).toBe(0);
    expect(failureCount()).toBe(0);
  });

  it('throws a refusal to the caller rather than hiding it', async () => {
    // The user is still looking at the form, so the real reason belongs
    // there, not in a banner after the fact.
    await expect(
      settleOrQueue(Promise.reject(permissionDenied()), 'Stock out 5 pcs, Mahogany Plank')
    ).rejects.toThrow(/insufficient permissions/i);

    // And it is not also recorded as a background failure, which would
    // report the same problem twice
    expect(failureCount()).toBe(0);
  });
});

// ============================================================
// A WRITE THE SERVER HAS NOT ANSWERED
// ============================================================

describe('a write that does not come back in time', () => {
  it('is reported as queued rather than freezing the caller', async () => {
    vi.useFakeTimers();

    const commit = deferred();
    const pendingOutcome = settleOrQueue(commit.promise, 'Stock out 20 pcs, Mahogany Plank');

    await vi.advanceTimersByTimeAsync(4500);
    const outcome = await pendingOutcome;

    expect(outcome.status).toBe(QUEUED);
    expect(pendingCount()).toBe(1);
    expect(failureCount()).toBe(0);

    vi.useRealTimers();
  });

  it('clears itself from pending once it does land', async () => {
    vi.useFakeTimers();

    const commit = deferred();
    const pendingOutcome = settleOrQueue(commit.promise, 'Stock in 10 sheets, Marine Plywood');

    await vi.advanceTimersByTimeAsync(4500);
    await pendingOutcome;
    expect(pendingCount()).toBe(1);

    commit.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(pendingCount()).toBe(0);
    expect(failureCount()).toBe(0);

    vi.useRealTimers();
  });

  // ---- The case this module exists for ----

  it('becomes a visible failure when the server later refuses it', async () => {
    vi.useFakeTimers();

    const commit = deferred();
    const pendingOutcome = settleOrQueue(
      commit.promise,
      'Stock out 20 pcs, Mahogany Plank (Project Usage: order #102)'
    );

    // The user has been told it is saved and has moved on
    await vi.advanceTimersByTimeAsync(4500);
    expect((await pendingOutcome).status).toBe(QUEUED);

    // Much later, the connection returns and the server refuses it
    commit.reject(permissionDenied());
    await vi.advanceTimersByTimeAsync(0);

    expect(pendingCount()).toBe(0);
    expect(failureCount()).toBe(1);

    const [failure] = failureList();
    // Named, so the user knows which entry to make again
    expect(failure.description).toBe(
      'Stock out 20 pcs, Mahogany Plank (Project Usage: order #102)'
    );
    // And told why, in terms they can act on
    expect(failure.reason).toMatch(/stock figure had already changed/i);

    vi.useRealTimers();
  });

  it('explains a lost connection differently from a refusal', async () => {
    vi.useFakeTimers();

    const commit = deferred();
    const outcome = settleOrQueue(commit.promise, 'Stock in 5 cans, Contact Adhesive');
    await vi.advanceTimersByTimeAsync(4500);
    await outcome;

    const error = new Error('The service is currently unavailable.');
    error.code = 'unavailable';
    commit.reject(error);
    await vi.advanceTimersByTimeAsync(0);

    expect(failureList()[0].reason).toMatch(/connection was lost/i);

    vi.useRealTimers();
  });

  it('keeps several failures apart, so each can be re-entered', async () => {
    vi.useFakeTimers();

    const first = deferred();
    const second = deferred();

    const a = settleOrQueue(first.promise, 'Stock out 20 pcs, Mahogany Plank');
    const b = settleOrQueue(second.promise, 'Stock out 3 cans, Contact Adhesive');

    await vi.advanceTimersByTimeAsync(4500);
    await a;
    await b;
    expect(pendingCount()).toBe(2);

    first.reject(permissionDenied());
    second.reject(permissionDenied());
    await vi.advanceTimersByTimeAsync(0);

    expect(failureCount()).toBe(2);
    expect(failureList().map((f) => f.description)).toEqual([
      'Stock out 20 pcs, Mahogany Plank',
      'Stock out 3 cans, Contact Adhesive',
    ]);

    vi.useRealTimers();
  });
});

// ============================================================
// NOTIFYING THE INTERFACE
// ============================================================

describe('telling the interface', () => {
  it('notifies a subscriber when a write fails, so the banner can appear', async () => {
    vi.useFakeTimers();

    const seen = [];
    const unsubscribe = onSyncChange((snapshot) => seen.push(snapshot));

    const commit = deferred();
    const outcome = settleOrQueue(commit.promise, 'Stock out 20 pcs, Mahogany Plank');
    await vi.advanceTimersByTimeAsync(4500);
    await outcome;

    commit.reject(permissionDenied());
    await vi.advanceTimersByTimeAsync(0);

    // Once when it was queued, once when it failed
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1].failures).toHaveLength(1);

    unsubscribe();
    vi.useRealTimers();
  });

  it('stops notifying after unsubscribing', async () => {
    const seen = [];
    const unsubscribe = onSyncChange((snapshot) => seen.push(snapshot));
    unsubscribe();

    dismissAllFailures();

    expect(seen).toHaveLength(0);
  });
});

// ============================================================
// CLEARING A FAILURE
// ============================================================

describe('clearing a failure', () => {
  async function failOne(description) {
    vi.useFakeTimers();
    const commit = deferred();
    const outcome = settleOrQueue(commit.promise, description);
    await vi.advanceTimersByTimeAsync(4500);
    await outcome;
    commit.reject(permissionDenied());
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  }

  it('removes one by id', async () => {
    await failOne('Stock out 20 pcs, Mahogany Plank');
    expect(failureCount()).toBe(1);

    dismissFailure(failureList()[0].id);
    expect(failureCount()).toBe(0);
  });

  it('removes all of them, which is what the banner button does', async () => {
    await failOne('Stock out 20 pcs, Mahogany Plank');
    await failOne('Stock out 3 cans, Contact Adhesive');
    expect(failureCount()).toBe(2);

    dismissAllFailures();
    expect(failureCount()).toBe(0);
  });

  it('ignores an id that is not there', async () => {
    await failOne('Stock out 20 pcs, Mahogany Plank');

    dismissFailure(9999);
    expect(failureCount()).toBe(1);
  });
});
