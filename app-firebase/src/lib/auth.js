// Authentication and account bootstrapping
//
// Replaces AuthController.php and UserController::create(). The old system
// had the general manager type a password for each new employee. Here people
// register themselves and the manager approves them, so no password is ever
// handled, stored, or shared by anyone but its owner.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';

import { auth, db } from './firebase.js';
import {
  WEBMASTER_EMAIL,
  ROLE_WEBMASTER,
  ROLE_PRODUCTION_STAFF,
  STATUS_ACTIVE,
  STATUS_PENDING,
} from './config.js';
import { auditedWrite } from './audit.js';
import { setCurrentUser, clearCurrentUser, currentUser } from './session.js';

// ============================================================
// THE WEBMASTER ADDRESS
//
// Compared case-insensitively, because Google may present the address with
// different capitalisation than it was typed. Everything else about the
// comparison is exact: no normalising of dots, no stripping of +tags. An
// address like tedcmartinez2+staff@gmail.com reaches the same Gmail inbox
// but is NOT the webmaster, and firestore.rules agrees, because the rules
// compare the literal string too.
// ============================================================

export function isWebmasterEmail(email) {
  return (email || '').trim().toLowerCase() === WEBMASTER_EMAIL.toLowerCase();
}

// ============================================================
// SIGN IN
// ============================================================

export async function signInWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  await bootstrapUser(credential.user, 'password');
  await logSignIn();
  return credential.user;
}

export async function registerWithEmail(name, email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

  // The verification email is sent before anything else, so a user whose
  // account creation half-finished still gets the link.
  await sendEmailVerification(credential.user);

  await bootstrapUser(credential.user, 'password', name.trim());
  return credential.user;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();

  // Always show the account chooser. Without this, a desktop shared by the
  // shop staff silently reuses whichever Google account signed in last.
  provider.setCustomParameters({ prompt: 'select_account' });

  const credential = await signInWithPopup(auth, provider);
  await bootstrapUser(credential.user, 'google.com');
  await logSignIn();
  return credential.user;
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}

export async function resendVerification() {
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

// ============================================================
// SIGN OUT
//
// The logout entry is written before signing out, because once signOut()
// finishes there is no authenticated user left and firestore.rules would
// refuse the write. A failure here must not trap someone in the app, so it
// is logged to the console and the sign-out proceeds.
// ============================================================

export async function signOutUser() {
  try {
    const user = currentUser();
    if (user) {
      await auditedWrite([], {
        action: 'auth.logout',
        entity: 'auth',
        entityId: user.uid,
        summary: `${user.name || user.email} signed out`,
      });
    }
  } catch (error) {
    console.warn('Could not record the sign-out in the audit trail:', error);
  }

  clearCurrentUser();
  await signOut(auth);
}

async function logSignIn() {
  const user = currentUser();
  if (!user) return;

  await auditedWrite(
    [
      {
        type: 'update',
        collection: 'users',
        id: user.uid,
        data: {
          lastLoginAt: serverTimestamp(),
          emailVerified: user.emailVerified,
        },
      },
    ],
    {
      action: 'auth.login',
      entity: 'auth',
      entityId: user.uid,
      summary: `${user.name || user.email} signed in via ${providerLabel(user.provider)}`,
    }
  );
}

function providerLabel(provider) {
  return provider === 'google.com' ? 'Google' : 'email and password';
}

// ============================================================
// ACCOUNT BOOTSTRAPPING
//
// Runs on every sign-in. If the person has no user document yet, this is
// their first time and one is created. What it may contain is fixed by the
// rules, not chosen here:
//
//   the verified webmaster address  ->  role webmaster, status active
//   everybody else                  ->  role production_staff, status pending
//
// So a new employee can sign in but sees nothing until the manager approves
// them, and nobody can register themselves into a privileged role.
// ============================================================

// Returned when the webmaster address signs in with an unverified email.
// See the comment on the throw below for why this is a special case.
export class WebmasterVerificationRequired extends Error {
  constructor() {
    super('The webmaster address must be verified before it can be used.');
    this.name = 'WebmasterVerificationRequired';
  }
}

export async function bootstrapUser(firebaseUser, provider, nameOverride = '') {
  const snapshot = await getDoc(doc(db, 'users', firebaseUser.uid));

  if (snapshot.exists()) {
    setCurrentUser(toSessionUser(firebaseUser, provider, snapshot.data()));
    return snapshot.data();
  }

  const claimsWebmaster = isWebmasterEmail(firebaseUser.email);

  // The webmaster role is granted on a verified address only, and the rules
  // check the email_verified claim in the token, not a field we send. If the
  // webmaster registers with email and password, that claim is false until
  // they click the link in their inbox.
  //
  // Creating the document anyway would make them pending staff, and because
  // roles can only be set by somebody else, they would have no way back to
  // webmaster. So no document is created yet and the interface asks them to
  // verify first. Nothing is lost: their Firebase account already exists, and
  // the next sign-in after verifying creates the right document.
  if (claimsWebmaster && !firebaseUser.emailVerified) {
    throw new WebmasterVerificationRequired();
  }

  const role = claimsWebmaster ? ROLE_WEBMASTER : ROLE_PRODUCTION_STAFF;
  const status = claimsWebmaster ? STATUS_ACTIVE : STATUS_PENDING;

  const profile = {
    name: nameOverride || firebaseUser.displayName || firebaseUser.email.split('@')[0],
    email: firebaseUser.email,
    photoURL: firebaseUser.photoURL || null,
    provider,
    role,
    status,
    emailVerified: firebaseUser.emailVerified,
    createdAt: serverTimestamp(),
    approvedBy: claimsWebmaster ? firebaseUser.uid : null,
    approvedAt: claimsWebmaster ? serverTimestamp() : null,
    lastLoginAt: serverTimestamp(),
  };

  // The session is set before the write because auditedWrite() stamps the
  // entry with the acting user, and this user is the actor for their own
  // registration.
  setCurrentUser(toSessionUser(firebaseUser, provider, profile));

  await auditedWrite(
    [{ type: 'set', collection: 'users', id: firebaseUser.uid, data: profile }],
    {
      action: 'user.register',
      entity: 'users',
      entityId: firebaseUser.uid,
      after: { name: profile.name, email: profile.email, role, status, provider },
      summary: claimsWebmaster
        ? `Webmaster account established for ${profile.email}`
        : `${profile.name} registered via ${providerLabel(provider)} and is awaiting approval`,
    }
  );

  return profile;
}

// Merges the Firebase account with the Firestore profile into the one object
// the rest of the app reads through session.js.
function toSessionUser(firebaseUser, provider, profile) {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    emailVerified: firebaseUser.emailVerified,
    name: profile.name || firebaseUser.displayName || firebaseUser.email,
    photoURL: profile.photoURL || firebaseUser.photoURL || null,
    provider: profile.provider || provider,
    role: profile.role,
    status: profile.status,
  };
}

// ============================================================
// SESSION RESTORE
//
// Firebase remembers the signed-in account across page reloads, so on every
// load the profile has to be fetched again before the interface can know
// which role to draw. Until that finishes the app shows its loading screen,
// which is why index.html starts with one.
//
// Sign-ins are NOT logged here. This fires on every page refresh, and
// recording a login each time would bury the real sign-ins in noise. The
// entry is written by the sign-in functions above instead.
// ============================================================

export function watchAuth(onResolved) {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      clearCurrentUser();
      onResolved(null);
      return;
    }

    try {
      const provider = firebaseUser.providerData[0]?.providerId || 'password';
      await bootstrapUser(firebaseUser, provider);
      onResolved(currentUser());
    } catch (error) {
      if (error instanceof WebmasterVerificationRequired) {
        onResolved({ needsWebmasterVerification: true, email: firebaseUser.email });
        return;
      }
      onResolved(null, error);
    }
  });
}

// Refreshes the account from Firebase, used by the "I have verified my
// email" button. The ID token is forced to refresh so the rules see the
// updated email_verified claim rather than the stale one in the old token.
export async function refreshVerification() {
  if (!auth.currentUser) return false;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser.emailVerified;
}
