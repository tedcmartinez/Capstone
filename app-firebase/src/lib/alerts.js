// Low-stock and stock-out email alerts
//
// In the LAN version, Notification::checkAndNotify() ran on the server right
// after a stock-out, read the material's new quantity, applied the 24 hour
// deduplication rule, and sent mail through PHPMailer.
//
// None of that can happen in the browser. Sending mail needs a credential,
// and any credential the browser holds is a credential the shop's users
// hold. So the work moves to a Google Apps Script owned by
// cornerblock.alerts@gmail.com, which this module only asks to run.
//
// The script is deliberately not trusted with numbers from here. It is given
// the material id and the caller's ID token, and reads the quantity from
// Firestore itself, so a tampered browser cannot talk it into announcing a
// stock-out that never happened or suppressing one that did.
//
// The script is built in step 9 of the migration. Until its URL is filled in
// below, requestStockCheck() reports that alerts are not configured and the
// movement is otherwise unaffected.

import { auth } from './firebase.js';
import { APPS_SCRIPT_URL } from './config.js';

export const ALERTS_NOT_CONFIGURED = 'not-configured';
export const ALERTS_SENT = 'sent';
export const ALERTS_UNREACHABLE = 'unreachable';
export const ALERTS_REFUSED = 'refused';

export function alertsConfigured() {
  return Boolean(APPS_SCRIPT_URL);
}

// Asks the script to check one material and send whatever alerts are due.
//
// This never throws. A stock-out that has already been saved must not be
// reported as a failure because an email could not be sent, which is
// acceptance test 17: the movement stands, and the interface says the alert
// did not go out. Failed attempts are recorded in notification_log by the
// script itself when it can be reached at all.
export async function requestStockCheck(materialId) {
  if (!alertsConfigured()) {
    return { status: ALERTS_NOT_CONFIGURED };
  }

  try {
    const idToken = await auth.currentUser.getIdToken();

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      // Apps Script web apps reject a preflight request, so the content type
      // is kept to one that does not trigger CORS preflight. The body is
      // still JSON and the script parses it as such.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'checkStock', idToken, materialId }),
    });

    if (!response.ok) {
      return { status: ALERTS_UNREACHABLE, detail: `HTTP ${response.status}` };
    }

    const result = await response.json();

    if (result.ok === false) {
      return { status: ALERTS_REFUSED, detail: result.error || 'The alert service refused the request.' };
    }

    return {
      status: ALERTS_SENT,
      // What the script decided: which alerts it sent, and which it skipped
      // because one had already gone out within the last 24 hours.
      sent: result.sent || [],
      skipped: result.skipped || [],
      recipients: result.recipients || 0,
    };
  } catch (error) {
    // Offline, or the script is unreachable. Either way the movement is
    // already saved, so this is reported rather than raised.
    return { status: ALERTS_UNREACHABLE, detail: error?.message || 'No connection.' };
  }
}

// Turns the result into a sentence for the person who just logged the
// movement, or null when there is nothing worth saying.
export function describeAlertResult(result, materialName) {
  if (!result) return null;

  switch (result.status) {
    case ALERTS_SENT: {
      if (result.sent.length === 0) {
        // Either nothing was due, or an identical alert was sent recently.
        // The second case is worth saying, so nobody wonders why the email
        // did not arrive.
        if (result.skipped.length > 0) {
          return {
            kind: 'info',
            text:
              `${materialName} is still below its threshold. No new alert was sent, ` +
              'because one went out within the last 24 hours.',
          };
        }
        return null;
      }
      const which = result.sent.join(' and ');
      return {
        kind: 'info',
        text: `A ${which} alert was emailed to ${result.recipients} recipient${result.recipients === 1 ? '' : 's'}.`,
      };
    }

    case ALERTS_NOT_CONFIGURED:
      return {
        kind: 'info',
        text: 'The movement was saved. Email alerts are not set up yet, so none was sent.',
      };

    case ALERTS_UNREACHABLE:
      return {
        kind: 'danger',
        text:
          'The movement was saved, but the alert service could not be reached, ' +
          'so no email was sent. Check the connection and tell the manager if ' +
          `${materialName} needs reordering.`,
      };

    case ALERTS_REFUSED:
      return {
        kind: 'danger',
        text: `The movement was saved, but the alert service refused the request: ${result.detail}`,
      };

    default:
      return null;
  }
}

// Used by the Settings page to show whether the alert service is answering.
export async function pingAlertService() {
  if (!alertsConfigured()) return { ok: false, status: ALERTS_NOT_CONFIGURED };

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'ping' }),
    });

    if (!response.ok) return { ok: false, status: ALERTS_UNREACHABLE, detail: `HTTP ${response.status}` };

    const result = await response.json();
    return { ok: true, status: ALERTS_SENT, sender: result.sender, quotaRemaining: result.quotaRemaining };
  } catch (error) {
    return { ok: false, status: ALERTS_UNREACHABLE, detail: error?.message || 'No connection.' };
  }
}
