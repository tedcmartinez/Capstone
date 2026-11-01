// Watching the signed-in account for changes
//
// A manager approves, disables or changes the role of an account from
// another computer. Without this the person affected would only find out
// on their next page reload: a new employee would sit on the waiting screen
// until they thought to refresh, and someone who had been disabled could
// keep using the open app.
//
// So while anyone is signed in, the app listens to their own users/{uid}
// document, the one document every account may read, pending ones included.
// When the role or status in it changes, the session is updated and main.js
// moves the person to the screen their account now allows.
//
// There is one listener for the whole session, not one per page. It is
// started on sign-in, replaced if a different account signs in, and stopped
// on sign-out, so moving between pages never adds another.
//
// No ID token refresh is needed. The rules read the role and status from
// this same document with get() on every request, not from token claims,
// so the moment the document says active, the rules say so too.

import { doc, onSnapshot } from 'firebase/firestore';

import { db } from './firebase.js';
import { currentUser, setCurrentUser } from './session.js';

let unsubscribe = null;
let watchedUid = null;

// Calls onChange(before, after) whenever the account's role or status
// changes from what the session holds. Other edits to the document, such as
// the lastLoginAt written on each sign-in, are ignored.
export function watchAccount(uid, onChange) {
  if (unsubscribe && watchedUid === uid) return;
  stopWatchingAccount();

  watchedUid = uid;
  unsubscribe = onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      const before = currentUser();
      if (!snapshot.exists() || !before || before.uid !== uid) return;

      const profile = snapshot.data();
      if (profile.role === before.role && profile.status === before.status) return;

      setCurrentUser({ ...before, role: profile.role, status: profile.status });
      onChange(before, currentUser());
    },
    (error) => {
      // Only reached if the listener itself fails, for example the
      // connection being lost for good. The app keeps working on the
      // session it has; the next page load reads the account afresh.
      console.warn('Stopped watching the account for changes:', error);
    }
  );
}

// What a change means for the screen: 'enter' when the account has just
// been approved, so the app opens at the role's starting page, and
// 'redraw' for anything else, which the guard in main.js sorts out.
export function nextStep(before, after) {
  return before.status !== 'active' && after.status === 'active' ? 'enter' : 'redraw';
}

export function stopWatchingAccount() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  watchedUid = null;
}
