// Date ranges
//
// The From and To dates on Movement History, the Audit Trail and the Stock
// Movement Report, and the presets beside them. Days are the shop's days:
// Philippine time, whatever timezone the computer happens to be set to.
//
// Dates travel as YYYY-MM-DD strings, which is how a date input reports
// them, how movementDate is stored, and how they sit in the page's URL.
// No Firebase imports, so the unit tests can check every edge.

export const SHOP_TIME_ZONE = 'Asia/Manila';
const SHOP_OFFSET = '+08:00';

// Today in the shop, as YYYY-MM-DD
export function shopToday(now = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function parts(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
}

function iso(year, month, day) {
  // Date.UTC normalises overflow, so day 0 is the last day of the month before
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

// The first and last moments of a shop day, for filtering timestamps.
// "To" includes the whole day, up to 11:59:59.999 PM Philippine time.
export function startOfShopDay(dateIso) {
  return new Date(`${dateIso}T00:00:00.000${SHOP_OFFSET}`);
}

export function endOfShopDay(dateIso) {
  return new Date(`${dateIso}T23:59:59.999${SHOP_OFFSET}`);
}

// ============================================================
// PRESETS
// ============================================================

export const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'all', label: 'All time' },
];

// { from, to } for a preset, counted from today in the shop
export function presetRange(key, today = shopToday()) {
  const { year, month, day } = parts(today);

  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      // Today and the six days before it
      return { from: iso(year, month, day - 6), to: today };
    case 'thisMonth':
      return { from: iso(year, month, 1), to: today };
    case 'lastMonth':
      return { from: iso(year, month - 1, 1), to: iso(year, month, 0) };
    case 'all':
    default:
      return { from: '', to: '' };
  }
}

// Which preset a range is, if any, so its button can show as selected
export function matchingPreset(from, to, today = shopToday()) {
  const found = DATE_PRESETS.find((preset) => {
    const range = presetRange(preset.key, today);
    return range.from === (from || '') && range.to === (to || '');
  });
  return found ? found.key : null;
}

// ============================================================
// CHECKING AND DESCRIBING
// ============================================================

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The message to show when a range cannot be used, or null when it can.
// Either end may be left empty.
export function rangeProblem(from, to) {
  if (from && !ISO_DATE.test(from)) return 'The From date is not a valid date.';
  if (to && !ISO_DATE.test(to)) return 'The To date is not a valid date.';
  if (from && to && from > to) return 'The From date is after the To date. Pick a From date on or before the To date.';
  return null;
}

function monthDay(dateIso) {
  const { year, month, day } = parts(dateIso);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function monthDayYear(dateIso) {
  const { year } = parts(dateIso);
  return `${monthDay(dateIso)}, ${year}`;
}

// "from Nov 1 to Nov 2, 2026", "on Nov 2, 2026", "since Nov 1, 2026",
// "up to Nov 2, 2026", or "" for all time. Goes after a count in a heading:
// "42 entries from Nov 1 to Nov 2, 2026".
export function describeRange(from, to) {
  if (from && to) {
    if (from === to) return `on ${monthDayYear(from)}`;
    const sameYear = parts(from).year === parts(to).year;
    return `from ${sameYear ? monthDay(from) : monthDayYear(from)} to ${monthDayYear(to)}`;
  }
  if (from) return `since ${monthDayYear(from)}`;
  if (to) return `up to ${monthDayYear(to)}`;
  return '';
}

// "42 entries from Nov 1 to Nov 2, 2026", for the heading of a filtered list
export function countHeading(count, noun, from, to) {
  const plural = count === 1 ? noun : noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  const range = describeRange(from, to);
  return `${count.toLocaleString('en-PH')} ${plural}${range ? ` ${range}` : ''}`;
}
