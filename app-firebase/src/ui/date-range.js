// The From / To date filter, with presets
//
// Used by Movement History, the Audit Trail and the Stock Movement Report,
// so the three behave identically: two labelled date boxes sitting in the
// filter row, five preset buttons, and an inline message instead of a query
// when From is after To. Changing anything applies at once.
//
//   ${dateRangeHtml({ from, to })}
//   wireDateRange(scope, ({ from, to }) => { ...reload... });
//
// The callback only ever receives a usable range.

import { esc, $, $$ } from '../lib/dom.js';
import { DATE_PRESETS, presetRange, matchingPreset, rangeProblem } from '../lib/dates.js';

export function dateRangeHtml({ from = '', to = '', idPrefix = 'dr' } = {}) {
  const active = matchingPreset(from, to);

  return `
    <div class="cb-daterange" data-daterange>
      <div class="cb-daterange-field">
        <label class="cb-daterange-label" for="${idPrefix}From">From</label>
        <input type="date" id="${idPrefix}From" name="from" class="cb-input" value="${esc(from)}">
      </div>
      <div class="cb-daterange-field">
        <label class="cb-daterange-label" for="${idPrefix}To">To</label>
        <input type="date" id="${idPrefix}To" name="to" class="cb-input" value="${esc(to)}">
      </div>
      <div class="cb-presets" role="group" aria-label="Date presets">
        ${DATE_PRESETS.map(
          (preset) => `
          <button type="button" class="cb-preset${active === preset.key ? ' is-active' : ''}"
                  data-preset="${preset.key}" aria-pressed="${active === preset.key}">
            ${esc(preset.label)}
          </button>`
        ).join('')}
      </div>
      <div class="cb-field-error cb-daterange-error" role="alert" data-daterange-error></div>
    </div>`;
}

export function wireDateRange(scope, onChange) {
  const root = $('[data-daterange]', scope);
  if (!root) return;

  const fromInput = root.querySelector('input[name="from"]');
  const toInput = root.querySelector('input[name="to"]');
  const error = root.querySelector('[data-daterange-error]');

  function apply() {
    const from = fromInput.value;
    const to = toInput.value;
    const problem = rangeProblem(from, to);

    error.textContent = problem || '';
    if (problem) return;

    const active = matchingPreset(from, to);
    $$('[data-preset]', root).forEach((button) => {
      const on = button.dataset.preset === active;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    });

    onChange({ from, to });
  }

  // These two belong to the range, not to the surrounding filter form, so
  // the form's own change handler must not also act on them
  [fromInput, toInput].forEach((input) =>
    input.addEventListener('change', (event) => {
      event.stopPropagation();
      apply();
    })
  );

  $$('[data-preset]', root).forEach((button) => {
    button.addEventListener('click', () => {
      const range = presetRange(button.dataset.preset);
      fromInput.value = range.from;
      toInput.value = range.to;
      apply();
    });
  });
}
