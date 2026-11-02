// Exporting to Google Sheets
//
// Used by Movement History, which is where the export lives. It was on the
// Audit Trail page first, which is why the tests are in audit-export.test.js.
//
// This runs entirely in the browser, which is what keeps it free: there is
// no server to hold Google credentials, because the manager's own Google
// account creates the spreadsheet, in their own Drive, with a token that
// lasts an hour and is never stored.
//
// The scope asked for is drive.file, which lets the system see only the
// files it creates itself. It cannot read, list or change anything else in
// the manager's Drive. The broader "spreadsheets" or "drive" scopes would
// work too, but would ask the manager to trust the system with every file
// they own, which nothing here needs.

import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
} from 'firebase/auth';

import { auth } from './firebase.js';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
// The tab inside the new spreadsheet, unless the caller names its own
const DEFAULT_TAB = 'Movements';

// Rows are sent in batches so a large export stays well inside the size a
// single request may be
const APPEND_BATCH = 2000;

// ============================================================
// ERRORS THE PAGE RESPONDS TO DIFFERENTLY
// ============================================================

// The manager closed the Google window, or chose not to grant access to
// Drive. Not a fault: the page offers the CSV download instead.
export class SheetsDeclined extends Error {
  constructor(message = 'Google Drive access was not granted.') {
    super(message);
    this.name = 'SheetsDeclined';
  }
}

// The Google Sheets API is switched off for the project. This is a setup
// step for whoever administers the system, not something the manager can
// fix, so it is reported in those terms.
export class SheetsNotEnabled extends Error {
  constructor() {
    super(
      'Google Sheets export has not been switched on for this system yet. ' +
        'Download the CSV instead, and ask the system administrator to enable ' +
        'the Google Sheets API.'
    );
    this.name = 'SheetsNotEnabled';
  }
}

// ============================================================
// WHO CAN USE IT
// ============================================================

// Only an account signed in through Google has a Google Drive to write to.
// A manager who signed in with an email and password is offered the CSV.
export function canExportToSheets() {
  const user = auth.currentUser;
  if (!user) return false;
  return user.providerData.some((provider) => provider.providerId === 'google.com');
}

// ============================================================
// THE TOKEN
//
// Asked for at the moment of export rather than at sign-in. A manager who
// never exports is never asked for Drive access, and the request arrives
// with an obvious reason attached: they have just pressed Export.
// ============================================================

async function requestDriveToken() {
  const user = auth.currentUser;

  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_FILE_SCOPE);

  // Puts the signed-in account first in Google's chooser, so the manager
  // does not have to find it again, and reduces the chance of picking a
  // different account by mistake.
  provider.setCustomParameters({ login_hint: user.email });

  let result;
  try {
    result = await reauthenticateWithPopup(user, provider);
  } catch (error) {
    const code = error?.code || '';

    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/user-cancelled'
    ) {
      throw new SheetsDeclined('The Google window was closed before access was granted.');
    }

    if (code === 'auth/user-mismatch') {
      throw new SheetsDeclined(
        `A different Google account was chosen. Choose ${user.email}, the one you are signed in with.`
      );
    }

    throw error;
  }

  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new SheetsDeclined();

  return token;
}

// ============================================================
// THE SHEETS API
// ============================================================

async function sheetsRequest(token, url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (response.ok) return response.json();

  let detail = {};
  try {
    detail = (await response.json())?.error || {};
  } catch {
    // The body was not JSON, so there is nothing more to learn from it
  }

  const message = String(detail.message || '');

  // The API is switched off for the Google Cloud project
  if (
    response.status === 403 &&
    (/has not been used|is disabled|SERVICE_DISABLED/i.test(message) ||
      detail.details?.some?.((d) => d.reason === 'SERVICE_DISABLED'))
  ) {
    throw new SheetsNotEnabled();
  }

  // The token arrived without the Drive scope. Google lets a person untick
  // individual permissions on the consent screen, and this is what that
  // looks like from here.
  if (response.status === 403 || response.status === 401) {
    throw new SheetsDeclined(
      'Permission to create the spreadsheet in your Google Drive was not given.'
    );
  }

  throw new Error(`Google Sheets refused the request (${response.status}). ${message}`.trim());
}

// Creates the spreadsheet with its first row already frozen, so the header
// stays in view however far down the manager scrolls
export async function createSpreadsheet(token, title, tab = DEFAULT_TAB) {
  const created = await sheetsRequest(token, SHEETS_API, {
    properties: { title },
    sheets: [
      {
        properties: {
          title: tab,
          gridProperties: { frozenRowCount: 1 },
        },
      },
    ],
  });

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
    sheetId: created.sheets?.[0]?.properties?.sheetId ?? 0,
  };
}

// RAW means every value is stored exactly as text, never interpreted. Some
// summaries contain text people typed, and USER_ENTERED would let a note
// beginning with "=" run as a formula in the manager's spreadsheet.
export async function appendRows(token, spreadsheetId, rows, tab = DEFAULT_TAB) {
  const range = encodeURIComponent(`'${tab}'!A1`);
  const url =
    `${SHEETS_API}/${spreadsheetId}/values/${range}:append` +
    '?valueInputOption=RAW&insertDataOption=INSERT_ROWS';

  for (let start = 0; start < rows.length; start += APPEND_BATCH) {
    await sheetsRequest(token, url, { values: rows.slice(start, start + APPEND_BATCH) });
  }
}

// Bold header, then every column sized to what it holds. Autosizing comes
// last because it measures the contents, so it has to run after they exist.
export async function formatSheet(token, spreadsheetId, sheetId, columnCount) {
  await sheetsRequest(token, `${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    requests: [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      },
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: columnCount,
          },
        },
      },
    ],
  });
}

// ============================================================
// THE WHOLE EXPORT
// ============================================================

// rows includes the header as its first row. Returns the spreadsheet's
// address for the "Open in Sheets" button.
export async function exportToSheets({ title, rows, tab = DEFAULT_TAB }) {
  const token = await requestDriveToken();

  const sheet = await createSpreadsheet(token, title, tab);
  await appendRows(token, sheet.spreadsheetId, rows, tab);
  await formatSheet(token, sheet.spreadsheetId, sheet.sheetId, rows[0]?.length || 0);

  return sheet;
}

// ============================================================
// THE CSV FALLBACK
// ============================================================

// Hands the browser a file to save. The object URL is released straight
// after, since the browser has already taken its copy by then.
export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
