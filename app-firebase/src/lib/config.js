// Application configuration
//
// Everything in this file is safe to commit to version control. The Firebase
// web config is not a secret: it only identifies which project the browser is
// talking to. What a signed-in user is actually allowed to read or write is
// decided by firestore.rules on Google's servers, never by this file.

// ============================================================
// FIREBASE PROJECT
// Web app "cornerblock-web" in the cornerblock-inventory project.
// storageBucket is left in place because the Firebase console generates it,
// but Cloud Storage is never used: it needs the paid Blaze plan, so receipt
// images are stored inside Firestore instead.
// ============================================================

export const firebaseConfig = {
  apiKey: 'AIzaSyBNRjuhfQSCJEP06p9W4gvVEI10NssiZOM',
  authDomain: 'cornerblock-inventory.firebaseapp.com',
  projectId: 'cornerblock-inventory',
  storageBucket: 'cornerblock-inventory.firebasestorage.app',
  messagingSenderId: '281463397004',
  appId: '1:281463397004:web:32e25dd550689f9b76f9a9',
};

// ============================================================
// WEBMASTER
// The only identity hardcoded anywhere in the system, and only the email
// address, never a password. Whoever signs in with this verified address is
// treated as the webmaster: the role that can promote a Cornerblock employee
// to general manager, so the client can never be locked out of their own data.
//
// IMPORTANT: this value is duplicated in firestore.rules, because security
// rules cannot import from JavaScript. If it is ever changed, it must be
// changed in both places and the rules redeployed.
// ============================================================

export const WEBMASTER_EMAIL = 'tedcmartinez2@gmail.com';

// ============================================================
// IDENTITY AND VERSIONING
// ============================================================

// The system's full name, as the capstone names it. Shown on the login
// page, in the browser tab, in Settings and as the installed app's name.
export const SYSTEM_TITLE =
  'Cloud-Based Materials Inventory Management System with Email Notification for Cornerblock Trading Inc.';

// Written into every audit log entry so a record can be traced back to the
// version of the app that created it.
export const APP_VERSION = '2.0.0';

export const COMPANY_NAME = 'Cornerblock Trading Inc.';

// ============================================================
// ROLES
// The three roles, in order of privilege. Kept as constants so a typo in a
// role name fails loudly at build time instead of silently denying access.
// ============================================================

export const ROLE_WEBMASTER = 'webmaster';
export const ROLE_GENERAL_MANAGER = 'general_manager';
export const ROLE_PRODUCTION_STAFF = 'production_staff';

// How each role is written out in the interface
export const ROLE_LABELS = {
  [ROLE_WEBMASTER]: 'Webmaster',
  [ROLE_GENERAL_MANAGER]: 'General Manager',
  [ROLE_PRODUCTION_STAFF]: 'Production Staff',
};

// ============================================================
// ACCOUNT STATUS
// A new account starts as 'pending' and cannot see any inventory data until
// the general manager approves it.
// ============================================================

export const STATUS_PENDING = 'pending';
export const STATUS_ACTIVE = 'active';
export const STATUS_DISABLED = 'disabled';

// ============================================================
// EMAIL ALERTS
//
// The deployed URL of the Google Apps Script that sends the low-stock and
// stock-out alerts and the reorder checklist. It is owned by
// cornerblock.alerts@gmail.com and runs as that account, which is how mail
// is sent without this app holding any credential: there is no password or
// app password anywhere in the system.
//
// Safe to commit. The URL is only an address, and the script verifies the
// caller's Firebase ID token and checks they are an active user before it
// does anything.
//
// Deployed as version 1 of the web app. If this is ever emptied, the app
// skips the alert call and says so, rather than failing a saved movement.
// ============================================================

export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwQ4xj3mts-MIa1x3zJXeGfhjbre5-TVTkLhzMd9NsEfy8mlXRz7MQRF8wk-c4SEy5X/exec';

// ============================================================
// RECEIPT IMAGES
// Receipts live inside Firestore documents, and a Firestore document cannot
// exceed 1 MB. Base64 encoding adds about a third to a file's size, so the
// limit below leaves a wide safety margin.
// ============================================================

export const RECEIPT_MAX_BYTES = 300 * 1000;
export const RECEIPT_MAX_DIMENSION = 1280;
export const RECEIPT_JPEG_QUALITY = 0.7;

// The JPEG quality settings tried in turn, starting from the one above. Most
// receipts are text on white paper and fit at the first; a dense photograph
// needs a lower one. Anything still over the limit after the last is refused.
// Shared by the browser and by the data migration, so an old receipt brought
// across from the LAN version is treated exactly like a new upload.
export const RECEIPT_QUALITY_STEPS = [RECEIPT_JPEG_QUALITY, 0.6, 0.5, 0.4];

// ============================================================
// PAGINATION
// ============================================================

export const PAGE_SIZE = 50;
