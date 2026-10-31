// Who may do what to whose account
//
// One function answers, for a given viewer and a given account, which of the
// Users page's buttons apply. It mirrors the users update rule in
// firestore.rules line for line, so the page never offers a button the
// server would refuse, and never hides one the server would allow.
//
// The rules are the protection. This only decides what to draw. It is kept
// separate from the page so it can be tested against the same cases as the
// rules themselves.

import {
  ROLE_WEBMASTER,
  ROLE_GENERAL_MANAGER,
  ROLE_PRODUCTION_STAFF,
  STATUS_PENDING,
  STATUS_ACTIVE,
  STATUS_DISABLED,
} from './config.js';

const NONE = {
  approve: false,
  reject: false,
  disable: false,
  enable: false,
  promote: false,
  demote: false,
};

// viewer: the signed-in person, { uid, role, status }
// target: the account on the row, { id, role, status }
//
// Returns the actions as booleans, plus a short reason when there are none,
// which the page shows in place of the buttons.
export function accountActions(viewer, target) {
  const viewerIsWebmaster = viewer?.role === ROLE_WEBMASTER;
  const viewerIsManager =
    viewer?.status === STATUS_ACTIVE &&
    (viewerIsWebmaster || viewer?.role === ROLE_GENERAL_MANAGER);

  if (!viewerIsManager) {
    return { ...NONE, reason: 'No actions' };
  }

  // The webmaster account cannot be changed by anybody
  if (target.role === ROLE_WEBMASTER) {
    return { ...NONE, reason: 'Cannot be changed' };
  }

  // Nobody changes their own role or status
  if (target.id === viewer.uid) {
    return { ...NONE, reason: 'Your own account' };
  }

  const isPending = target.status === STATUS_PENDING;

  return {
    approve: isPending,
    reject: isPending,
    disable: target.status === STATUS_ACTIVE,
    enable: target.status === STATUS_DISABLED,

    // Only the webmaster may make someone a manager. Offered once the
    // account is approved, so approval and promotion stay two decisions.
    promote: viewerIsWebmaster && !isPending && target.role === ROLE_PRODUCTION_STAFF,

    // Either kind of manager may return a manager to staff
    demote: !isPending && target.role === ROLE_GENERAL_MANAGER,

    reason: null,
  };
}

// The role an account would have after a promotion or a demotion
export function roleAfter(action) {
  return action === 'promote' ? ROLE_GENERAL_MANAGER : ROLE_PRODUCTION_STAFF;
}
