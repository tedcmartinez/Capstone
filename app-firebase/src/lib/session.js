// The signed-in user
//
// This replaces core/Auth.php. The PHP version kept the user in $_SESSION
// and every controller called Auth::role() or Auth::requireRole(). Here the
// same information is held in one module and read the same way.
//
// The important difference from the PHP version: these checks decide what
// the interface shows, not what the database allows. A user who edits the
// page in their browser to reveal a hidden column still cannot read the
// data behind it, because firestore.rules refuses the query. The PHP app
// made the same point by enforcing roles in controllers rather than views.

import {
  ROLE_WEBMASTER,
  ROLE_GENERAL_MANAGER,
  ROLE_PRODUCTION_STAFF,
  ROLE_LABELS,
  STATUS_ACTIVE,
  STATUS_PENDING,
  STATUS_DISABLED,
} from './config.js';

// The current user, or null when nobody is signed in. Shape:
//   { uid, email, name, photoURL, provider, role, status, emailVerified }
let user = null;

export function currentUser() {
  return user;
}

export function setCurrentUser(next) {
  user = next;
}

export function clearCurrentUser() {
  user = null;
}

// ============================================================
// IDENTITY
// ============================================================

export const isSignedIn = () => user !== null;
export const uid = () => user?.uid ?? null;
export const name = () => user?.name ?? '';
export const email = () => user?.email ?? '';
export const role = () => user?.role ?? null;
export const status = () => user?.status ?? null;

export const roleLabel = () => ROLE_LABELS[user?.role] ?? '';

// ============================================================
// ROLE CHECKS
//
// isManager() is the one the pages use most. It is true for the webmaster as
// well as the general manager, because the webmaster can do everything a
// manager can. This mirrors the PHP views, which asked
// Auth::role() === 'general_manager' to decide whether to show cost,
// supplier and admin sections.
// ============================================================

export const isActive = () => user?.status === STATUS_ACTIVE;
export const isPending = () => user?.status === STATUS_PENDING;
export const isDisabled = () => user?.status === STATUS_DISABLED;

export const isWebmaster = () => user?.role === ROLE_WEBMASTER;

export const isManager = () =>
  isActive() && (user?.role === ROLE_WEBMASTER || user?.role === ROLE_GENERAL_MANAGER);

export const isStaffMember = () =>
  isActive() && user?.role === ROLE_PRODUCTION_STAFF;

// Anyone approved to use the system at all
export const canUseApp = () => isActive();

// Only the webmaster may make someone a general manager, so the client can
// never be locked out of their own system: if every manager were removed,
// the webmaster could still appoint one. Removing the role, by contrast, is
// open to managers too. The full set of account permissions is in
// lib/accounts.js, which mirrors firestore.rules.
export const canPromoteToManager = () => isWebmaster();

// ============================================================
// INITIALS
// Ported from the avatar logic in layouts/header.php: "Ted Martinez"
// becomes "TM".
// ============================================================

export function initials() {
  const parts = (user?.name || user?.email || '').trim().split(/\s+/);
  return parts
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('');
}
