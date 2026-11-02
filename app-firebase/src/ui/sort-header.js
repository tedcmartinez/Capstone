// Sortable table headers
//
// A sortable column heading looks exactly like a plain one (the same
// uppercase, size, colour and weight, with no border or background) plus a
// small arrow: ▲ or ▼ on the column the table is sorted by, and a faint ▲▼
// on the others that can be sorted.
//
// It is still a real button inside the heading cell, so it can be reached
// with Tab and pressed with Enter or Space, and the cell carries aria-sort
// so a screen reader announces the order. The focus ring shows only for
// keyboard focus (:focus-visible), not after a mouse click.
//
//   sortableTh({ field: 'name', label: 'Name' }, { field, direction })
//
// The page wires clicks on [data-sort] as before.

import { esc } from '../lib/dom.js';

export function sortableTh(column, sort, { className = '' } = {}) {
  const active = sort.field === column.field;
  const ariaSort = active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  const arrow = active ? (sort.direction === 'asc' ? '&#9650;' : '&#9660;') : '&#9650;&#9660;';

  return `
    <th class="${esc(className)}" aria-sort="${ariaSort}">
      <button type="button" class="cb-sort${active ? ' is-active' : ''}" data-sort="${esc(column.field)}">
        ${esc(column.label)}<span class="cb-sort-arrow${active ? '' : ' is-idle'}" aria-hidden="true">${arrow}</span>
      </button>
    </th>`;
}
