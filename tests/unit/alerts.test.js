// The app's side of the alert service
//
// lib/alerts.js is how the browser talks to the Apps Script. What matters is
// that it never throws, so a saved stock movement is never reported as a
// failure because an email could not go out, and that a refusal from the
// script is reported as a refusal rather than as success.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// A deployed script URL and a signed-in user, without Firebase
vi.mock('../../app-firebase/src/lib/config.js', async (importOriginal) => ({
  ...(await importOriginal()),
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/test/exec',
}));

vi.mock('../../app-firebase/src/lib/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'id-token-abc' } },
}));

const alerts = await import('../../app-firebase/src/lib/alerts.js');

let requests;

function scriptReplies(body, { status = 200, json = true } = {}) {
  requests = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok: status < 400,
      status,
      json: async () => {
        if (!json) throw new SyntaxError('Unexpected token');
        return body;
      },
    };
  });
}

function scriptUnreachable() {
  requests = [];
  globalThis.fetch = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
}

beforeEach(() => {
  requests = [];
});

// ============================================================
// HOW EVERY CALL IS MADE
// ============================================================

describe('calling the script', () => {
  it('sends the ID token with every request', async () => {
    scriptReplies({ ok: true, sent: [], skipped: [], recipients: 0 });

    await alerts.requestStockCheck('m1');

    expect(requests[0].body).toEqual({ action: 'checkStock', idToken: 'id-token-abc', materialId: 'm1' });
  });

  it('sends plain text, which needs no CORS preflight', async () => {
    // Apps Script cannot answer a preflight, so a JSON content type would
    // make every call fail in the browser
    scriptReplies({ ok: true });

    await alerts.pingAlertService();

    expect(requests[0].init.headers['Content-Type']).toBe('text/plain;charset=utf-8');
  });
});

// ============================================================
// STOCK CHECKS
// ============================================================

describe('requestStockCheck', () => {
  it('reports what the script sent and skipped', async () => {
    scriptReplies({ ok: true, sent: ['low-stock'], skipped: ['stock-out'], recipients: 3 });

    const result = await alerts.requestStockCheck('m1');

    expect(result).toEqual({
      status: alerts.ALERTS_SENT,
      sent: ['low-stock'],
      skipped: ['stock-out'],
      recipients: 3,
    });
  });

  it('17. does not throw when the script cannot be reached', async () => {
    // The movement is already saved. Being offline must come back as a
    // status the page can explain, never as an exception that looks like
    // the save itself failed.
    scriptUnreachable();

    const result = await alerts.requestStockCheck('m1');

    expect(result.status).toBe(alerts.ALERTS_UNREACHABLE);
  });

  it('reports a refusal with the script’s own reason', async () => {
    scriptReplies({ ok: false, error: 'Your account is not active.', code: 'permission-denied' });

    const result = await alerts.requestStockCheck('m1');

    expect(result.status).toBe(alerts.ALERTS_REFUSED);
    expect(result.detail).toBe('Your account is not active.');
  });

  it('copes with a reply that is not JSON', async () => {
    scriptReplies(null, { json: false });

    expect((await alerts.requestStockCheck('m1')).status).toBe(alerts.ALERTS_UNREACHABLE);
  });

  it('copes with an HTTP error from Google', async () => {
    scriptReplies({}, { status: 500 });

    expect((await alerts.requestStockCheck('m1')).status).toBe(alerts.ALERTS_UNREACHABLE);
  });
});

// ============================================================
// THE SETTINGS PAGE STATUS CHECK
// ============================================================

describe('pingAlertService', () => {
  it('reports the sender and the mail left today', async () => {
    scriptReplies({ ok: true, sender: 'cornerblock.alerts@gmail.com', quotaRemaining: 97 });

    expect(await alerts.pingAlertService()).toEqual({
      ok: true,
      status: alerts.ALERTS_SENT,
      sender: 'cornerblock.alerts@gmail.com',
      quotaRemaining: 97,
    });
  });

  it('reports a refusal as a refusal, not as working', async () => {
    // The bug this replaced: any reply at all was treated as success, so a
    // script refusing every request for lack of an IAM role would have
    // shown on the Settings page as working
    scriptReplies({
      ok: false,
      code: 'setup',
      error: 'The alert service account does not have permission to use Firestore.',
    });

    const result = await alerts.pingAlertService();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(alerts.ALERTS_REFUSED);
    expect(result.detail).toContain('does not have permission');
  });

  it('reports an unreachable service', async () => {
    scriptUnreachable();

    const result = await alerts.pingAlertService();

    expect(result.ok).toBe(false);
    expect(result.status).toBe(alerts.ALERTS_UNREACHABLE);
  });
});

// ============================================================
// THE CHECKLIST
// ============================================================

describe('sendChecklist', () => {
  it('sends only the recipients, since the script builds the list itself', async () => {
    scriptReplies({ ok: true, sent: 2, failed: 0, materialCount: 4 });

    await alerts.sendChecklist({ recipientUids: ['u1', 'u2'], extraEmail: 'orders@supplier.example' });

    expect(requests[0].body).toEqual({
      action: 'sendChecklist',
      idToken: 'id-token-abc',
      recipientUids: ['u1', 'u2'],
      extraEmail: 'orders@supplier.example',
    });
    // No materials, quantities or thresholds travel from the browser
    expect(requests[0].body).not.toHaveProperty('materials');
  });

  it('leaves out an empty outside address', async () => {
    scriptReplies({ ok: true, sent: 1, failed: 0, materialCount: 2 });

    await alerts.sendChecklist({ recipientUids: ['u1'], extraEmail: '' });

    expect(requests[0].body).not.toHaveProperty('extraEmail');
  });

  it('passes the counts back', async () => {
    scriptReplies({ ok: true, sent: 2, failed: 1, failedAddresses: ['bad@x'], materialCount: 4 });

    const result = await alerts.sendChecklist({ recipientUids: ['u1', 'u2', 'u3'] });

    expect(result.ok).toBe(true);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failedAddresses).toEqual(['bad@x']);
  });

  it('reports the script’s reason when it declines', async () => {
    scriptReplies({ ok: false, error: 'Nothing needs reordering right now, so there is no checklist to send.' });

    const result = await alerts.sendChecklist({ recipientUids: ['u1'] });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('Nothing needs reordering');
  });
});

// ============================================================
// WHAT THE PERSON IS TOLD AFTER A STOCK-OUT
// ============================================================

describe('describeAlertResult', () => {
  it('says how many people were emailed', () => {
    const text = alerts.describeAlertResult(
      { status: alerts.ALERTS_SENT, sent: ['low-stock'], skipped: [], recipients: 3 },
      'Mahogany Plank'
    ).text;

    expect(text).toContain('3 recipients');
  });

  it('explains why no email went out when one was sent recently', () => {
    const text = alerts.describeAlertResult(
      { status: alerts.ALERTS_SENT, sent: [], skipped: ['low-stock'], recipients: 0 },
      'Mahogany Plank'
    ).text;

    expect(text).toContain('within the last 24 hours');
  });

  it('says nothing when no alert was due', () => {
    expect(
      alerts.describeAlertResult({ status: alerts.ALERTS_SENT, sent: [], skipped: [], recipients: 0 }, 'X')
    ).toBeNull();
  });

  it('17. tells the person the movement was saved even when email failed', () => {
    const text = alerts.describeAlertResult({ status: alerts.ALERTS_UNREACHABLE }, 'Mahogany Plank').text;

    expect(text).toContain('The movement was saved');
  });
});
