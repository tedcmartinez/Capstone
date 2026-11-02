// Movement reasons
//
// Kept in a module of their own, with no Firebase imports, so that the data
// migration in tools/migrate can use exactly the same lists as the app. The
// migration reads reasons back out of the LAN version's notes column, and
// recognising one depends on these lists matching the ones the old forms
// offered.
//
// Ported from MovementController::allowedReasons().

export function allowedReasons(type) {
  if (type === 'in') return ['Purchase', 'Restock', 'Return', 'Correction'];
  if (type === 'out') return ['Project Usage', 'Damaged', 'Transfer', 'Other'];

  // Adjustments. A reason is required rather than optional, because an
  // adjustment overrides a figure the recorded movements do not account
  // for, and six months later somebody will want to know why.
  return ['Physical Count', 'Damage Found', 'Loss or Theft', 'Data Correction'];
}

// The dropdown showed "Stock Correction" while storing "Correction"
export const REASON_LABELS = {
  Correction: 'Stock Correction',
};

export function reasonLabel(reason) {
  return REASON_LABELS[reason] || reason;
}

// ============================================================
// WHAT EACH MOVEMENT MUST SAY
//
// The same requirements firestore.rules enforces on a new movement, checked
// in the form first so the Confirm button can wait for them and nothing is
// ever queued offline that the server would refuse when it syncs:
//
//   stock-in                a receipt photo
//   stock-out               a project, 2 to 100 characters, unless Damaged
//   reason Other            notes of at least 5 characters
// ============================================================

export const PROJECT_MIN = 2;
export const PROJECT_MAX = 100;
export const OTHER_NOTES_MIN = 5;

export const projectRequired = (type, reason) => type === 'out' && reason !== 'Damaged';
export const notesRequired = (type, reason) => reason === 'Other' && (type === 'in' || type === 'out');
export const receiptRequired = (type) => type === 'in';

// The project as stored for searching: lowercased, trimmed, single spaces.
// firestore.rules builds the same key from the project and refuses a
// movement whose projectKey does not match.
export function projectKey(project) {
  return String(project || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// What is still missing, keyed by field, with the sentence to show beside
// it. An empty object means the form is ready to confirm.
export function missingRequirements({ type, reason, project, notes, hasReceipt }) {
  const missing = {};

  if (receiptRequired(type) && !hasReceipt) {
    missing.receipt = 'Attach a photo of the delivery receipt.';
  }

  const projectText = String(project || '').trim();
  if (projectRequired(type, reason) && projectText.length < PROJECT_MIN) {
    missing.project = 'Enter the project these materials are for.';
  } else if (projectText.length > PROJECT_MAX) {
    missing.project = `Keep the project to ${PROJECT_MAX} characters or fewer.`;
  }

  if (notesRequired(type, reason) && String(notes || '').trim().length < OTHER_NOTES_MIN) {
    missing.notes = `Explain the reason for this ${type === 'in' ? 'stock-in' : 'stock-out'}.`;
  }

  return missing;
}
