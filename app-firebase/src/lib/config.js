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

export const APP_NAME = 'Cornerblock Inventory System';

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
// RECEIPT IMAGES
// Receipts live inside Firestore documents, and a Firestore document cannot
// exceed 1 MB. Base64 encoding adds about a third to a file's size, so the
// limit below leaves a wide safety margin.
// ============================================================

export const RECEIPT_MAX_BYTES = 300 * 1000;
export const RECEIPT_MAX_DIMENSION = 1280;
export const RECEIPT_JPEG_QUALITY = 0.7;

// ============================================================
// PAGINATION
// ============================================================

export const PAGE_SIZE = 50;
