// What a pending or disabled account is shown
//
// The wording is fixed, because it is what a new employee reads straight
// after registering: a plain explanation, the address the request went in
// under, and a way to sign out. Never a Firebase error.

import { describe, it, expect } from 'vitest';

import { pendingHtml, disabledHtml } from '../../app-firebase/src/pages/gate.js';

describe('the waiting screen', () => {
  const html = pendingHtml('maria@example.com');

  it('says the request was sent, and that the app opens by itself', () => {
    expect(html).toContain('Request sent');
    expect(html).toContain('Your account request has been sent to the General Manager.');
    expect(html).toContain("You'll get access as soon as it's approved.");
    expect(html).toContain('it will open the app automatically');
  });

  it('shows the address the request was sent under, and a Sign out button', () => {
    expect(html).toContain('maria@example.com');
    expect(html).toContain('id="cbSignOut"');
  });

  it('has no button to check again, since it no longer needs one', () => {
    expect(html).not.toContain('cbRecheck');
  });

  it('escapes the address', () => {
    expect(pendingHtml('<b>x</b>@example.com')).not.toContain('<b>x</b>');
  });
});

describe('the no-access screen', () => {
  const html = disabledHtml('juan@example.com');

  it('gives the one plain sentence, the address, and Sign out', () => {
    expect(html).toContain("Your account doesn't have access. Contact the General Manager.");
    expect(html).toContain('juan@example.com');
    expect(html).toContain('id="cbSignOut"');
  });

  it('shows no Firebase wording', () => {
    expect(html).not.toMatch(/permission|firebase|insufficient/i);
  });
});
