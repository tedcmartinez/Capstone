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
