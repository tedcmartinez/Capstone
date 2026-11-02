// Display formatting
//
// How stored values are written on screen. Nothing here changes what is
// saved: categories, for instance, stay exactly as they were typed, and
// only their display is tidied. No Firebase imports, so the unit tests and
// the migration tools can use it freely.

// Category names were typed in lowercase in the LAN version ("solid wood",
// "adhesives"). Shown in Title Case: the first letter of each word is
// capitalised, and any capitals already typed are left alone.
export function categoryLabel(category) {
  return String(category || '')
    .trim()
    .replace(/(^|[\s\-/(])(\p{L})/gu, (match, before, letter) => before + letter.toUpperCase());
}

// A count shown with a sign, for the stock-out totals. Without this a
// withdrawal of nothing reads "-0", because the total is negated for
// display and JavaScript keeps the sign of a negative zero.
export function signedCount(value, sign) {
  const amount = Math.abs(Number(value) || 0);
  if (amount === 0) return '0';
  return `${sign}${amount.toLocaleString('en-PH')}`;
}
