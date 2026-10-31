// Registration and approval, end to end
//
// The rules tests in tests/rules prove what the server permits. These tests
// prove the application code actually does the right thing: that
// bootstrapUser() creates the correct account for each kind of sign-in, that
// an approval really unlocks the system, and that each of those steps leaves
// the audit entry it should.
//
// They run against the Auth and Firestore emulators, with the real
// firestore.rules loaded, so a mistake in the app code shows up here rather
// than on the shop desktop.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

// The app modules read this when they initialise Firebase, so it has to be
// set before any of them is imported.
globalThis.__CORNERBLOCK_USE_EMULATORS__ = true;

const PROJECT_ID = 'cornerblock-inventory';

// The Firestore emulator applies the real security rules to its REST API as
// well, so a plain fetch is refused exactly as a browser would be. Passing
// the emulator's reserved owner token bypasses the rules, which is what a
// test needs in order to observe and seed data from outside the app. It is
// an emulator-only facility and has no equivalent against a live project.
const OWNER = { Authorization: 'Bearer owner' };

// Modules are imported dynamically, after the global above is in place.
let auth;
let db;
let authLib;
let session;
let firestore;

beforeAll(async () => {
  // Point the Auth SDK at the emulator before it tries to reach Google
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

  firestore = await import('firebase/firestore');
  const firebaseModule = await import('../../app-firebase/src/lib/firebase.js');
  auth = firebaseModule.auth;
  db = firebaseModule.db;

  authLib = await import('../../app-firebase/src/lib/auth.js');
  session = await import('../../app-firebase/src/lib/session.js');
});

afterAll(async () => {
  await auth.signOut().catch(() => {});
});

// Both emulators are wiped between tests so each one starts from nothing.
// These REST endpoints are the emulators' own admin interfaces.
beforeEach(async () => {
  await fetch(
    `http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' }
  );
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  await auth.signOut().catch(() => {});
  session.clearCurrentUser();
});

// ============================================================
// HELPERS
// ============================================================

// Offline persistence is switched on in this app, which changes what a
// resolved write means: batch.commit() resolves as soon as the change is in
// the browser's local cache, and the trip to the server happens afterwards.
// So a test that reads straight after a write can easily look before the
// server has it. These helpers poll until the expected state arrives, or
// give up, which also means a write the rules silently reject still fails
// the test rather than passing by luck.
async function waitFor(check, { attempts = 40, interval = 50 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return null;
}

async function fetchUserDoc(uid) {
  const response = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: OWNER }
  );
  if (!response.ok) return null;
  const body = await response.json();
  return body.fields || null;
}

// Waits for the document to reach the server
async function readUserDoc(uid) {
  return waitFor(() => fetchUserDoc(uid));
}

// Confirms a document is genuinely absent, rather than merely not there yet
async function readUserDocExpectingNone(uid) {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return fetchUserDoc(uid);
}

async function fetchAuditEntries() {
  const response = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/audit_logs`,
    { headers: OWNER }
  );
  if (!response.ok) return [];
  const body = await response.json();
  return (body.documents || []).map((doc) => ({
    id: doc.name.split('/').pop(),
    action: doc.fields?.action?.stringValue,
    entity: doc.fields?.entity?.stringValue,
    actorUid: doc.fields?.actorUid?.stringValue,
    summary: doc.fields?.summary?.stringValue,
  }));
}

// Waits until an entry with the given action shows up on the server
async function listAuditEntries(expectedAction = null) {
  if (!expectedAction) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return fetchAuditEntries();
  }
  const found = await waitFor(async () => {
    const entries = await fetchAuditEntries();
    return entries.some((e) => e.action === expectedAction) ? entries : null;
  });
  return found || fetchAuditEntries();
}

// Confirms an email address the same way the real user does: by opening the
// link from the verification message. The Auth emulator keeps the messages
// it would have sent, so the test reads the link out of there and follows
// it, which exercises the genuine flow rather than forcing a flag.
async function verifyEmailViaLink(email) {
  const response = await fetch(
    `http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/oobCodes`
  );
  const body = await response.json();

  const code = (body.oobCodes || [])
    .filter((entry) => entry.email === email && entry.requestType === 'VERIFY_EMAIL')
    .pop();

  if (!code) throw new Error(`No verification email was sent to ${email}`);

  // Following the link is what marks the address confirmed
  await fetch(code.oobLink);
}

// ============================================================
// 1. EMAIL AND PASSWORD REGISTRATION
// ============================================================

describe('registering with email and password', () => {
  it('creates a pending production_staff account', async () => {
    const user = await authLib.registerWithEmail(
      'Juan Dela Cruz',
      'juan@example.com',
      'Shopfloor2026'
    );

    const profile = await readUserDoc(user.uid);

    expect(profile).not.toBeNull();
    expect(profile.name.stringValue).toBe('Juan Dela Cruz');
    expect(profile.role.stringValue).toBe('production_staff');
    expect(profile.status.stringValue).toBe('pending');
    expect(profile.provider.stringValue).toBe('password');
  });

  it('records the registration in the audit trail', async () => {
    const user = await authLib.registerWithEmail(
      'Juan Dela Cruz',
      'juan@example.com',
      'Shopfloor2026'
    );

    const entries = await listAuditEntries('user.register');
    const registration = entries.find((e) => e.action === 'user.register');

    expect(registration).toBeDefined();
    expect(registration.actorUid).toBe(user.uid);
    expect(registration.entity).toBe('users');
    expect(registration.summary).toContain('awaiting approval');
  });

  it('leaves the new account unable to read materials', async () => {
    await authLib.registerWithEmail('Juan Dela Cruz', 'juan@example.com', 'Shopfloor2026');

    // Seeded past the rules, so there is something there to be refused
    await fetch(
      `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/materials?documentId=mat_1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...OWNER },
        body: JSON.stringify({ fields: { name: { stringValue: 'Mahogany Plank' } } }),
      }
    );

    // A denied read does not always surface as an exception. With a local
    // cache in play the SDK may answer from the cache instead, which for a
    // document it has never been allowed to see means "not found". Either
    // outcome is acceptable; what matters is that no material data comes
    // back. That is what is asserted here.
    let leaked = null;
    try {
      const snapshot = await firestore.getDoc(firestore.doc(db, 'materials', 'mat_1'));
      if (snapshot.exists()) leaked = snapshot.data();
    } catch (error) {
      expect(String(error)).toMatch(/permission|insufficient/i);
    }
    expect(leaked).toBeNull();
  });

  it('reports a pending account as pending, not active', async () => {
    await authLib.registerWithEmail('Juan Dela Cruz', 'juan@example.com', 'Shopfloor2026');

    expect(session.isPending()).toBe(true);
    expect(session.isActive()).toBe(false);
    expect(session.isManager()).toBe(false);
    expect(session.canUseApp()).toBe(false);
  });
});

// ============================================================
// 4. THE WEBMASTER ADDRESS MUST BE VERIFIED
// ============================================================

describe('the webmaster address', () => {
  it('is refused the webmaster role while unverified', async () => {
    // registerWithEmail is not used here because the login page blocks this
    // address on purpose. This goes straight at bootstrapUser to prove the
    // library itself refuses it, not just the form.
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    const credential = await createUserWithEmailAndPassword(
      auth,
      'tedcmartinez2@gmail.com',
      'Webmaster2026'
    );

    await expect(
      authLib.bootstrapUser(credential.user, 'password')
    ).rejects.toThrow(authLib.WebmasterVerificationRequired);

    // Nothing was written, so the account cannot get stuck as staff
    expect(await readUserDocExpectingNone(credential.user.uid)).toBeNull();
  });

  it('becomes an active webmaster once the address is verified', async () => {
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    const credential = await createUserWithEmailAndPassword(
      auth,
      'tedcmartinez2@gmail.com',
      'Webmaster2026'
    );

    const { sendEmailVerification } = await import('firebase/auth');
    await sendEmailVerification(credential.user);
    await verifyEmailViaLink('tedcmartinez2@gmail.com');

    // The token has to be refreshed, because the rules read email_verified
    // from the token and the one already issued still says false.
    await credential.user.reload();
    await credential.user.getIdToken(true);

    await authLib.bootstrapUser(credential.user, 'password');

    const profile = await readUserDoc(credential.user.uid);
    expect(profile.role.stringValue).toBe('webmaster');
    expect(profile.status.stringValue).toBe('active');

    expect(session.isWebmaster()).toBe(true);
    expect(session.isManager()).toBe(true);
    expect(session.canChangeManagerRole()).toBe(true);
  });

  it('treats a look-alike address as ordinary staff', async () => {
    const user = await authLib.registerWithEmail(
      'Impostor',
      'tedcmartinez2+staff@gmail.com',
      'Shopfloor2026'
    );

    const profile = await readUserDoc(user.uid);
    expect(profile.role.stringValue).toBe('production_staff');
    expect(profile.status.stringValue).toBe('pending');
  });
});

// ============================================================
// 5. APPROVAL UNLOCKS THE SYSTEM
// ============================================================

describe('approval', () => {
  it('lets an approved user read materials, and logs who approved them', async () => {
    // The employee registers and is left pending
    const staff = await authLib.registerWithEmail(
      'Juan Dela Cruz',
      'juan@example.com',
      'Shopfloor2026'
    );
    const staffUid = staff.uid;

    // A manager is seeded directly, standing in for an account the
    // webmaster promoted earlier
    const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import(
      'firebase/auth'
    );
    const gm = await createUserWithEmailAndPassword(auth, 'gm@example.com', 'Manager2026');
    await fetch(
      `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?documentId=${gm.user.uid}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...OWNER },
        body: JSON.stringify({
          fields: {
            name: { stringValue: 'Shop Manager' },
            email: { stringValue: 'gm@example.com' },
            role: { stringValue: 'general_manager' },
            status: { stringValue: 'active' },
            provider: { stringValue: 'password' },
            emailVerified: { booleanValue: true },
            lastAuditId: { stringValue: 'seed' },
          },
        }),
      }
    );

    // Seed a material for the approved user to read afterwards
    await fetch(
      `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/materials?documentId=mat_1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...OWNER },
        body: JSON.stringify({
          fields: {
            name: { stringValue: 'Mahogany Plank' },
            stockQuantity: { integerValue: '18' },
            minThreshold: { integerValue: '30' },
          },
        }),
      }
    );

    // The manager signs in and approves, through the same audited write the
    // Users page performs
    await signInWithEmailAndPassword(auth, 'gm@example.com', 'Manager2026');
    await authLib.bootstrapUser(auth.currentUser, 'password');

    const { auditedWrite } = await import('../../app-firebase/src/lib/audit.js');
    await auditedWrite(
      [
        {
          type: 'update',
          collection: 'users',
          id: staffUid,
          data: {
            status: 'active',
            approvedBy: auth.currentUser.uid,
            approvedAt: firestore.serverTimestamp(),
          },
        },
      ],
      {
        action: 'user.approve',
        entity: 'users',
        entityId: staffUid,
        summary: 'Approved Juan Dela Cruz',
      }
    );

    const approved = await readUserDoc(staffUid);
    expect(approved.status.stringValue).toBe('active');
    expect(approved.approvedBy.stringValue).toBe(gm.user.uid);

    const entries = await listAuditEntries('user.approve');
    expect(entries.some((e) => e.action === 'user.approve')).toBe(true);

    // Now the employee signs in again and can see the catalog
    await authLib.signInWithEmail('juan@example.com', 'Shopfloor2026');
    expect(session.isActive()).toBe(true);

    const snapshot = await firestore.getDoc(firestore.doc(db, 'materials', 'mat_1'));
    expect(snapshot.exists()).toBe(true);
    expect(snapshot.data().name).toBe('Mahogany Plank');
  });

  it('writes a login entry when somebody signs in', async () => {
    await authLib.registerWithEmail('Juan Dela Cruz', 'juan@example.com', 'Shopfloor2026');
    await auth.signOut();
    session.clearCurrentUser();

    await authLib.signInWithEmail('juan@example.com', 'Shopfloor2026');

    const entries = await listAuditEntries('auth.login');
    const login = entries.find((e) => e.action === 'auth.login');

    expect(login).toBeDefined();
    expect(login.summary).toContain('email and password');
  });

  it('writes a logout entry when somebody signs out', async () => {
    await authLib.registerWithEmail('Juan Dela Cruz', 'juan@example.com', 'Shopfloor2026');

    await authLib.signOutUser();

    const entries = await listAuditEntries('auth.logout');
    expect(entries.some((e) => e.action === 'auth.logout')).toBe(true);
    expect(session.isSignedIn()).toBe(false);
  });
});
