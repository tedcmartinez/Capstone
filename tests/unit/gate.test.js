// What a pending or disabled account is shown
//
// The wording is fixed, because it is what a new employee reads straight
// after registering: a plain explanation, the address the request went in
// under, and a way back to the login page. Never a Firebase error.

import { describe, it, expect } from 'vitest';

import { pendingHtml, verifyHtml, disabledHtml } from '../../app-firebase/src/pages/gate.js';
import { confirmationFor } from '../../app-firebase/src/pages/users.js';

const passwordUser = { email: 'maria@example.com', provider: 'password', emailVerified: false };
const googleUser = { email: 'pedro@example.com', provider: 'google.com', emailVerified: true };

describe('the Request sent screen', () => {
  const html = pendingHtml(passwordUser);

  it('says the request was sent, and that the app opens by itself', () => {
    expect(html).toContain('Request sent');
    expect(html).toContain('Your account request has been sent to the General Manager.');
    expect(html).toContain("You'll get access as soon as it's approved.");
    expect(html).toContain('it will open the app automatically');
  });

  it('shows the address, a Back to login button, and the hint under it', () => {
    expect(html).toContain('maria@example.com');
    expect(html).toMatch(/id="cbSignOut"[^>]*>\s*Back to login/);
    expect(html).toContain('Approved later? Just sign in again.');
    expect(html).not.toContain('Sign out');
  });

  it('has no button to check again, since it no longer needs one', () => {
    expect(html).not.toContain('cbRecheck');
  });

  it('escapes the address', () => {
    expect(pendingHtml({ email: '<b>x</b>@example.com' })).not.toContain('<b>x</b>');
  });
});

describe('email verification on the Request sent screen', () => {
  it('asks an unverified email and password account to check its inbox', () => {
    const html = pendingHtml(passwordUser);

    expect(html).toContain('We also sent a verification link to <strong>maria@example.com</strong>.');
    expect(html).toContain('Check your inbox and spam folder.');
    expect(html).toContain('Resend verification email');
  });

  it('shows only a small check once verified', () => {
    const html = verifyHtml({ ...passwordUser, emailVerified: true });

    expect(html).toContain('Email verified');
    expect(html).not.toContain('Resend');
    expect(html).not.toContain('We also sent');
  });

  it('says nothing about verification to a Google account', () => {
    const html = pendingHtml(googleUser);

    expect(html).not.toContain('verification');
    expect(html).not.toContain('Email verified');
  });
});

describe('the No access screen', () => {
  const html = disabledHtml('juan@example.com');

  it('gives the one plain sentence, the address, and Back to login', () => {
    expect(html).toContain("Your account doesn't have access. Contact the General Manager.");
    expect(html).toContain('juan@example.com');
    expect(html).toMatch(/id="cbSignOut"[^>]*>\s*Back to login/);
  });

  it('has no "Approved later" hint, which only suits a pending request', () => {
    expect(html).not.toContain('Approved later');
  });

  it('shows no Firebase wording', () => {
    expect(html).not.toMatch(/permission|firebase|insufficient/i);
  });
});

describe('what the Users page asks before acting', () => {
  const unverified = { name: 'Maria Santos', email: 'maria@example.com', emailVerified: false };
  const verified = { ...unverified, emailVerified: true };

  it('warns before approving an unverified account, and still allows it', () => {
    const question = confirmationFor('approve', unverified);

    expect(question.text).toBe("maria@example.com hasn't verified their email yet. Approve anyway?");
    expect(question.confirmLabel).toBe('Approve');
  });

  it('approves a verified account without asking', () => {
    expect(confirmationFor('approve', verified)).toBeNull();
  });

  it('asks before deleting, in red, with what is kept', () => {
    const question = confirmationFor('delete', verified);

    expect(question.text).toBe(
      "Delete Maria Santos (maria@example.com)? They lose access, and if they sign in again they'll " +
        'appear as a new request. Their past stock movements and audit entries are kept.'
    );
    expect(question.confirmLabel).toBe('Delete');
    expect(question.danger).toBe(true);
  });
});
