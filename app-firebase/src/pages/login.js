// Login and registration
//
// Replaces app/views/auth/login.php and app/views/users/create.php. The
// branded card is the same markup and the same classes as the PHP login
// page, with two additions: a Google button, and a Register tab, because
// accounts are no longer typed in for people by the general manager.

import { esc, render, $, alertHtml, friendlyError } from '../lib/dom.js';
import {
  signInWithEmail,
  registerWithEmail,
  signInWithGoogle,
  resetPassword,
  isWebmasterEmail,
} from '../lib/auth.js';
import { COMPANY_NAME, SYSTEM_TITLE } from '../lib/config.js';

// Which tab is showing, kept outside render() so a failed submission
// redraws the form the user was already on.
let mode = 'signin';
let message = null;

export function renderLogin() {
  const root = render('app', `
    <div class="cb-login">
      <div class="cb-login-card">
        <div class="cb-login-head">
          <div class="cb-login-mark">C</div>
          <div class="cb-login-word">Cornerblock</div>
          <div class="cb-login-tag">${esc(SYSTEM_TITLE)}</div>
        </div>

        <div class="cb-login-body">
          ${message ? alertHtml(message.kind, message.text) : ''}

          <div class="cb-auth-tabs">
            <button type="button" class="cb-auth-tab${mode === 'signin' ? ' is-active' : ''}" data-mode="signin">
              Log In
            </button>
            <button type="button" class="cb-auth-tab${mode === 'register' ? ' is-active' : ''}" data-mode="register">
              Register
            </button>
          </div>

          ${mode === 'signin' ? signInForm() : registerForm()}

          <div class="cb-auth-divider"><span>or</span></div>

          <button type="button" class="cb-btn cb-btn-outline w-100" id="cbGoogle">
            <svg width="16" height="16" viewBox="0 0 18 18" style="margin-right:8px;vertical-align:-3px;">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86a5.36 5.36 0 0 1-5.03-3.71H1.96v2.33A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.71V4.96H1.96A9 9 0 0 0 1 9c0 1.45.35 2.83.96 4.04l2.01-2.33z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 1.96 4.96l2.01 2.33A5.36 5.36 0 0 1 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          <p class="cb-help text-center mt-4 mb-0">
            ${esc(COMPANY_NAME)} &middot; Internal use only
          </p>
        </div>
      </div>
    </div>
  `);

  wire(root);
}

function signInForm() {
  return `
    <form id="cbSignIn" novalidate>
      <div class="cb-field">
        <label for="email" class="cb-field-label">Email</label>
        <input type="email" class="cb-input" id="email" name="email" required
               autocomplete="username" autofocus>
      </div>
      <div class="cb-field">
        <label for="password" class="cb-field-label">Password</label>
        <input type="password" class="cb-input" id="password" name="password" required
               autocomplete="current-password">
      </div>
      <button type="submit" class="cb-btn cb-btn-primary w-100" data-loading-text="Signing in...">
        Log In
      </button>
      <p class="text-center mt-3 mb-0">
        <button type="button" class="cb-link-btn" id="cbForgot">Forgot your password?</button>
      </p>
    </form>`;
}

// The registration form explains what happens next, because an employee who
// registers and then sees an empty waiting screen with no explanation will
// assume the system is broken and ask the manager.
function registerForm() {
  return `
    <form id="cbRegister" novalidate>
      <div class="cb-field">
        <label for="regName" class="cb-field-label">Full Name</label>
        <input type="text" class="cb-input" id="regName" name="name" required autofocus
               autocomplete="name" placeholder="e.g. Juan Dela Cruz">
      </div>
      <div class="cb-field">
        <label for="regEmail" class="cb-field-label">Email</label>
        <input type="email" class="cb-input" id="regEmail" name="email" required
               autocomplete="email">
      </div>
      <div class="cb-field">
        <label for="regPassword" class="cb-field-label">Password</label>
        <input type="password" class="cb-input" id="regPassword" name="password" required
               minlength="8" autocomplete="new-password">
        <div class="cb-help">At least 8 characters.</div>
      </div>
      <button type="submit" class="cb-btn cb-btn-primary w-100" data-loading-text="Creating account...">
        Create Account
      </button>
      <p class="cb-help text-center mt-3 mb-0">
        New accounts are checked by the general manager before they can be
        used. You will also get an email to confirm your address.
      </p>
    </form>`;
}

// ============================================================
// BEHAVIOUR
// ============================================================

function wire(root) {
  // Tab switching
  root.querySelectorAll('.cb-auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.mode;
      message = null;
      renderLogin();
    });
  });

  $('#cbSignIn', root)?.addEventListener('submit', (event) => {
    event.preventDefault();
    handle(event.target, async (form) => {
      const email = form.email.value.trim();
      const password = form.password.value;

      if (!email || !password) {
        throw new Error('Email and password are required.');
      }

      await signInWithEmail(email, password);
    });
  });

  $('#cbRegister', root)?.addEventListener('submit', (event) => {
    event.preventDefault();
    handle(event.target, async (form) => {
      const name = form.name.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;

      if (!name) throw new Error('Name is required.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters long.');

      // The webmaster address has to prove it controls the inbox before the
      // role is granted, and an email and password account starts
      // unverified. Registering this way would leave the account unable to
      // reach the webmaster role at all, so it is steered to Google, where
      // the address is already verified.
      if (isWebmasterEmail(email)) {
        throw new Error(
          'Use Continue with Google for this address, so the system can confirm the account is yours.'
        );
      }

      await registerWithEmail(name, email, password);
    });
  });

  $('#cbGoogle', root)?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const original = button.innerHTML;
    button.textContent = 'Opening Google...';

    try {
      await signInWithGoogle();
    } catch (error) {
      message = { kind: 'danger', text: friendlyError(error) };
      renderLogin();
      return;
    }
    button.disabled = false;
    button.innerHTML = original;
  });

  $('#cbForgot', root)?.addEventListener('click', async () => {
    const email = $('#email', root)?.value.trim();
    if (!email) {
      message = { kind: 'info', text: 'Type your email address first, then click the link again.' };
      renderLogin();
      return;
    }

    try {
      await resetPassword(email);
      message = {
        kind: 'success',
        text: `A password reset link has been sent to ${email}.`,
      };
    } catch (error) {
      message = { kind: 'danger', text: friendlyError(error) };
    }
    renderLogin();
  });
}

// Shared submit handling: disables the button so a slow connection cannot
// produce two accounts from one impatient double click, and turns any
// failure into a readable message. Ported from the loading state in
// public/js/app.js.
async function handle(form, action) {
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = button.dataset.loadingText || 'Please wait...';

  try {
    await action(form);
    // On success the auth watcher redraws the screen, so nothing is done
    // here. The button is deliberately left disabled during that moment.
  } catch (error) {
    message = { kind: 'danger', text: friendlyError(error) };
    renderLogin();
    return;
  }

  button.disabled = false;
  button.textContent = originalText;
}

// Lets the gate screens hand a message back to the login page, for example
// after a sign-out or a failed bootstrap.
export function setLoginMessage(kind, text) {
  message = { kind, text };
}
