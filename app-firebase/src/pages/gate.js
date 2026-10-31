// Account gate screens
//
// These stand between signing in and reaching the system. A pending account
// has authenticated successfully but has not been approved, so it must see
// something that explains the wait rather than an empty dashboard or a
// permission error. There was no equivalent in the LAN version, where the
// manager created every account by hand and it worked immediately.
//
// None of these screens reads inventory data, which is just as well: the
// security rules deny it to a pending or disabled account anyway.

import { render, $, esc, alertHtml, friendlyError } from '../lib/dom.js';
import { signOutUser, resendVerification, refreshVerification } from '../lib/auth.js';
import { currentUser } from '../lib/session.js';
import { resetShell } from '../ui/shell.js';

const icons = {
  pending:
    '<svg width="26" height="26" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>',
  disabled:
    '<svg width="26" height="26" fill="currentColor" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>',
  verify:
    '<svg width="26" height="26" fill="currentColor" viewBox="0 0 16 16"><path d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.587L16 11.801V4.697z"/></svg>',
};

function gateScreen({ kind, iconKey, title, text, email, actions }) {
  return `
    <div class="cb-gate">
      <div class="cb-gate-card">
        <div class="cb-gate-icon is-${esc(kind)}">${icons[iconKey]}</div>
        <h1 class="cb-gate-title">${esc(title)}</h1>
        <p class="cb-gate-text">${text}</p>
        ${email ? `<span class="cb-gate-email">${esc(email)}</span>` : ''}
        ${actions}
      </div>
    </div>`;
}

// ============================================================
// WAITING FOR APPROVAL
// ============================================================

export function renderPending() {
  const user = currentUser();

  const root = render('app', gateScreen({
    kind: 'pending',
    iconKey: 'pending',
    title: 'Waiting for approval',
    text:
      'Your account has been created and is waiting for the general manager ' +
      'to approve it. You will be able to sign in and use the system as soon ' +
      'as that is done.',
    email: user?.email,
    actions: `
      <div id="cbGateMessage"></div>
      <button type="button" class="cb-btn cb-btn-primary w-100" id="cbRecheck">
        Check again
      </button>
      <button type="button" class="cb-btn cb-btn-outline w-100 mt-2" id="cbSignOut">
        Sign out
      </button>
      ${
        user && !user.emailVerified
          ? `<p class="cb-help mt-3 mb-0">
               Your email address is not confirmed yet. Check your inbox for
               the confirmation link.
             </p>`
          : ''
      }`,
  }));

  wireCommon(root);

  // Re-reading the profile is the whole point of this button: the manager
  // may have approved the account in the meantime.
  $('#cbRecheck', root)?.addEventListener('click', () => window.location.reload());
}

// ============================================================
// DISABLED
// ============================================================

export function renderDisabled() {
  const user = currentUser();

  const root = render('app', gateScreen({
    kind: 'disabled',
    iconKey: 'disabled',
    title: 'Account disabled',
    text:
      'This account has been disabled and can no longer be used to sign in. ' +
      'Contact the general manager if you believe this is a mistake.',
    email: user?.email,
    actions: `
      <button type="button" class="cb-btn cb-btn-outline w-100" id="cbSignOut">
        Sign out
      </button>`,
  }));

  wireCommon(root);
}

// ============================================================
// WEBMASTER EMAIL VERIFICATION
//
// Only ever seen by the webmaster address, and only when it registered with
// a password instead of Google. The role is granted on a verified address,
// so until the link in the inbox is clicked there is nothing to grant. No
// user document is created in this state, which is deliberate: see the
// explanation in lib/auth.js.
// ============================================================

export function renderWebmasterVerification(email) {
  const root = render('app', gateScreen({
    kind: 'pending',
    iconKey: 'verify',
    title: 'Confirm your email address',
    text:
      'This address is the system administrator account, so it has to be ' +
      'confirmed before it can be used. Open the link in your inbox, then ' +
      'come back and continue.',
    email,
    actions: `
      <div id="cbGateMessage"></div>
      <button type="button" class="cb-btn cb-btn-primary w-100" id="cbVerified">
        I have confirmed it
      </button>
      <button type="button" class="cb-btn cb-btn-outline w-100 mt-2" id="cbResend">
        Send the email again
      </button>
      <button type="button" class="cb-btn cb-btn-outline w-100 mt-2" id="cbSignOut">
        Sign out
      </button>`,
  }));

  wireCommon(root);

  $('#cbVerified', root)?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Checking...';

    try {
      const verified = await refreshVerification();
      if (verified) {
        // The token now carries email_verified, which is what the rules
        // read, so a reload will set the account up properly.
        window.location.reload();
        return;
      }
      showGateMessage(
        'info',
        'Not confirmed yet. Open the link in your inbox, then try again.'
      );
    } catch (error) {
      showGateMessage('danger', friendlyError(error));
    }

    button.disabled = false;
    button.textContent = 'I have confirmed it';
  });

  $('#cbResend', root)?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;

    try {
      await resendVerification();
      showGateMessage('success', `Confirmation email sent to ${email}.`);
    } catch (error) {
      showGateMessage('danger', friendlyError(error));
    }

    button.disabled = false;
  });
}

// ============================================================
// SOMETHING WENT WRONG
//
// Shown when the profile could not be loaded at all, usually because the
// connection dropped during the first read. Signing out is offered because
// a half-established session is the one state the user cannot fix.
// ============================================================

export function renderAuthError(error) {
  const root = render('app', gateScreen({
    kind: 'disabled',
    iconKey: 'disabled',
    title: 'Could not load your account',
    text:
      'The system signed you in but could not read your account details. ' +
      'This is usually a connection problem.',
    email: friendlyError(error),
    actions: `
      <button type="button" class="cb-btn cb-btn-primary w-100" id="cbRetry">
        Try again
      </button>
      <button type="button" class="cb-btn cb-btn-outline w-100 mt-2" id="cbSignOut">
        Sign out
      </button>`,
  }));

  wireCommon(root);
  $('#cbRetry', root)?.addEventListener('click', () => window.location.reload());
}

// ============================================================
// SHARED
// ============================================================

function wireCommon(root) {
  $('#cbSignOut', root)?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    resetShell();
    await signOutUser();
  });
}

function showGateMessage(kind, text) {
  const target = document.getElementById('cbGateMessage');
  if (target) target.innerHTML = alertHtml(kind, text);
}
