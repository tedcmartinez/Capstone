// Registering, waiting, and being let in
//
// Two things the browser does that auth-flow.test.js does not reproduce:
//
//   1. The app's auth watcher (watchAuth in lib/auth.js) is always running.
//      Registering signs the new account in, which fires the watcher at the
//      same moment the registration code is still setting the account up.
//      These tests run both together, as the browser does, and check that
//      a new account sees no error.
//
//   2. The waiting screen listens to the account's own users/{uid}
//      document. These tests approve the account from outside, as a
//      manager would from another computer, and check the change reaches
//      the waiting user with no reload and no second sign-in. Then the
//      reverse: disabling or demoting someone who is using the app.
//
// Against the Auth and Firestore emulators, with the real firestore.rules.

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';

globalThis.__CORNERBLOCK_USE_EMULATORS__ = true;

const PROJECT_ID = 'cornerblock-inventory';
const OWNER = { Authorization: 'Bearer owner' };
const USERS_URL = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/users`;

let auth;
let authLib;
let session;
let accountWatch;
let materials;

beforeAll(async () => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

  const firebaseModule = await import('../../app-firebase/src/lib/firebase.js');
  auth = firebaseModule.auth;

  authLib = await import('../../app-firebase/src/lib/auth.js');
  session = await import('../../app-firebase/src/lib/session.js');
  accountWatch = await import('../../app-firebase/src/lib/accountWatch.js');
  materials = await import('../../app-firebase/src/lib/materials.js');
});

afterAll(async () => {
  await auth.signOut().catch(() => {});
});

// Every console.error and console.warn the app code makes is collected, so
// a test can check none of them is a refusal from the rules
let consoleErrors;
let stopAuthWatch = null;

beforeEach(async () => {
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  await auth.signOut().catch(() => {});
  session.clearCurrentUser();

  consoleErrors = [];
  const collect = (...args) => consoleErrors.push(args.map(String).join(' '));
  vi.spyOn(console, 'error').mockImplementation(collect);
  vi.spyOn(console, 'warn').mockImplementation(collect);
});

afterEach(() => {
  stopAuthWatch?.();
  stopAuthWatch = null;
  accountWatch.stopWatchingAccount();
  vi.restoreAllMocks();
});

// ============================================================
// HELPERS
// ============================================================

async function waitFor(check, { attempts = 80, interval = 50 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return null;
}

async function readUserDoc(uid) {
  return waitFor(async () => {
    const response = await fetch(`${USERS_URL}/${uid}`, { headers: OWNER });
    if (!response.ok) return null;
    return (await response.json()).fields || null;
  });
}

// Changes a user's account from outside the app, standing in for a manager
// clicking Approve or Disable on another computer
async function setAccount(uid, fields) {
  const mask = Object.keys(fields)
    .map((key) => `updateMask.fieldPaths=${key}`)
    .join('&');
  const body = {};
  for (const [key, value] of Object.entries(fields)) body[key] = { stringValue: value };

  const response = await fetch(`${USERS_URL}/${uid}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...OWNER },
    body: JSON.stringify({ fields: body }),
  });
  if (!response.ok) throw new Error(`Could not change the account: ${await response.text()}`);
}

// Starts the app's auth watcher, as main.js does on every page load, and
// records everything it reports
function startAuthWatch() {
  const reports = [];
  stopAuthWatch = authLib.watchAuth((user, error) => {
    reports.push({ user: user ? { ...user } : null, error: error || null });
  });
  return reports;
}

const refusals = () => consoleErrors.filter((line) => /permission|insufficient/i.test(line));

// ============================================================
// 1. NO ERROR AFTER REGISTERING
// ============================================================

describe('registering while the app is open', () => {
  it('with email and password: no error, and the account is pending', async () => {
    const reports = startAuthWatch();

    const user = await authLib.registerWithEmail('Maria Santos', 'maria@example.com', 'Shopfloor2026');

    const settled = await waitFor(() => reports.find((r) => r.user || r.error));
    expect(settled.error).toBeNull();
    expect(reports.every((r) => r.error === null)).toBe(true);
    expect(settled.user.status).toBe('pending');

    // The name typed in the form is kept, whichever of the two finished first
    const profile = await readUserDoc(user.uid);
    expect(profile.name.stringValue).toBe('Maria Santos');
    expect(profile.status.stringValue).toBe('pending');

    expect(session.isPending()).toBe(true);
    expect(refusals()).toEqual([]);
  });

  it('with Google: no error, and the account is pending', async () => {
    const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
    const reports = startAuthWatch();

    // The emulator accepts an unsigned Google identity, which stands in for
    // the popup. Then the same steps signInWithGoogle() takes after it.
    const credential = await signInWithCredential(
      auth,
      GoogleAuthProvider.credential(
        JSON.stringify({ sub: 'google-pedro', email: 'pedro@example.com', email_verified: true, name: 'Pedro Reyes' })
      )
    );
    await authLib.completeGoogleSignIn(credential.user);

    const settled = await waitFor(() => reports.find((r) => r.user || r.error));
    expect(settled.error).toBeNull();
    expect(reports.every((r) => r.error === null)).toBe(true);
    expect(settled.user.status).toBe('pending');

    const profile = await readUserDoc(credential.user.uid);
    expect(profile.status.stringValue).toBe('pending');
    expect(refusals()).toEqual([]);
  });

  it('a pending user who signs in again later is pending, with no error', async () => {
    await authLib.registerWithEmail('Maria Santos', 'maria@example.com', 'Shopfloor2026');
    await readUserDoc(auth.currentUser.uid);
    await authLib.signOutUser();

    const reports = startAuthWatch();
    await authLib.signInWithEmail('maria@example.com', 'Shopfloor2026');

    const settled = await waitFor(() => reports.find((r) => r.user || r.error));
    expect(settled.error).toBeNull();
    expect(settled.user.status).toBe('pending');
    expect(refusals()).toEqual([]);
  });
});

// ============================================================
// 2. LET IN AS SOON AS APPROVED
// ============================================================

// Registers a pending account and starts the app's listener on it, as
// main.js does, recording every change it reports
async function pendingUserWatching() {
  const user = await authLib.registerWithEmail('Maria Santos', 'maria@example.com', 'Shopfloor2026');
  await readUserDoc(user.uid);

  const changes = [];
  accountWatch.watchAccount(user.uid, (before, after) => changes.push({ before, after }));
  return { uid: user.uid, changes };
}

describe('a pending account with the waiting screen open', () => {
  it('cannot read the catalog while it waits', async () => {
    await pendingUserWatching();

    await expect(materials.loadMaterials()).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('is let in when a manager approves it: no reload, no second sign-in', async () => {
    const { uid, changes } = await pendingUserWatching();
    const tokenBefore = await auth.currentUser.getIdToken();

    await setAccount(uid, { status: 'active' });

    const change = await waitFor(() => changes[0]);
    expect(change.before.status).toBe('pending');
    expect(change.after.status).toBe('active');

    // The decision main.js acts on: enter the app, at the staff home
    expect(accountWatch.nextStep(change.before, change.after)).toBe('enter');
    expect(session.isActive()).toBe(true);
    expect(session.landingPath()).toBe('/materials');

    // The same sign-in, and the same token, can now read the catalog. The
    // rules read the role from the users document, so nothing about the
    // token had to change.
    expect(await auth.currentUser.getIdToken()).toBe(tokenBefore);
    await expect(materials.loadCatalog()).resolves.toBeDefined();

    expect(refusals()).toEqual([]);
  });

  it('enters at the dashboard when approved straight into a manager role', async () => {
    const { uid, changes } = await pendingUserWatching();

    await setAccount(uid, { status: 'active', role: 'general_manager' });

    const change = await waitFor(() => changes[0]);
    expect(accountWatch.nextStep(change.before, change.after)).toBe('enter');
    expect(session.landingPath()).toBe('/dashboard');
  });

  it('ignores edits that change neither role nor status', async () => {
    const { uid, changes } = await pendingUserWatching();

    await setAccount(uid, { name: 'Maria S. Santos' });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(changes).toEqual([]);
    expect(session.isPending()).toBe(true);
  });

  it('stops listening once told to, as on sign-out', async () => {
    const { uid, changes } = await pendingUserWatching();

    accountWatch.stopWatchingAccount();
    await setAccount(uid, { status: 'active' });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(changes).toEqual([]);
  });
});

// ============================================================
// 3. THE REVERSE: CHANGED WHILE USING THE APP
// ============================================================

describe('an account changed while it is in use', () => {
  async function activeStaffWatching() {
    const watched = await pendingUserWatching();
    await setAccount(watched.uid, { status: 'active' });
    await waitFor(() => watched.changes[0]);
    watched.changes.length = 0;
    return watched;
  }

  it('is moved out of the app when disabled', async () => {
    const { uid, changes } = await activeStaffWatching();

    await setAccount(uid, { status: 'disabled' });

    const change = await waitFor(() => changes[0]);
    expect(change.after.status).toBe('disabled');
    expect(accountWatch.nextStep(change.before, change.after)).toBe('redraw');
    expect(session.isDisabled()).toBe(true);
    expect(session.canUseApp()).toBe(false);
  });

  it('gains manager pages when promoted, and loses them when demoted', async () => {
    const { uid, changes } = await activeStaffWatching();

    await setAccount(uid, { role: 'general_manager' });
    await waitFor(() => changes[0]);
    expect(session.isManager()).toBe(true);
    expect(accountWatch.nextStep(changes[0].before, changes[0].after)).toBe('redraw');

    await setAccount(uid, { role: 'production_staff' });
    await waitFor(() => changes[1]);
    expect(session.isManager()).toBe(false);
    expect(session.landingPath()).toBe('/materials');
  });
});
