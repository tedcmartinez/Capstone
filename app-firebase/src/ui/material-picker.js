// Searchable material picker
//
// The catalog has over fifty materials, and a plain dropdown of that many
// means scrolling a long list to find one. This is a text box that filters
// the list as you type, with each option showing its category and the
// stock on hand.
//
// It follows the ARIA combobox pattern so it works from the keyboard and
// with a screen reader: the text box is the combobox, the list is a
// listbox, and aria-activedescendant names the highlighted option.
//
//   Down / Up     move through the list (opening it if closed)
//   Enter         choose the highlighted material
//   Esc           close the list, or clear the search if already closed
//
// The chosen id goes into a hidden input named materialId, so the form
// reads it exactly as it read the old select.

import { esc, $ } from '../lib/dom.js';
import { categoryLabel } from '../lib/format.js';

let pickerCount = 0;

// Plain text matching: every word typed must appear somewhere in the name
export function filterMaterials(materials, text) {
  const words = String(text || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return materials;
  return materials.filter((material) => {
    const name = String(material.name || '').toLowerCase();
    return words.every((word) => name.includes(word));
  });
}

// type 'out' disables materials with nothing left to take
export function materialPickerHtml(type, { id = 'sfMaterial', label = 'Material' } = {}) {
  pickerCount += 1;
  const listId = `${id}List${pickerCount}`;

  return `
    <div class="cb-field cb-picker" data-picker data-type="${esc(type)}" data-list-id="${esc(listId)}">
      <label class="cb-field-label" for="${esc(id)}">${esc(label)}</label>
      <input type="hidden" name="materialId" value="">
      <input type="text" id="${esc(id)}" class="cb-input" autocomplete="off"
             placeholder="Type to search materials"
             role="combobox" aria-autocomplete="list" aria-expanded="false"
             aria-controls="${esc(listId)}">
      <ul class="cb-picker-list" id="${esc(listId)}" role="listbox" aria-label="Materials" hidden></ul>
      ${
        type === 'out'
          ? '<div class="cb-help">Materials with no stock left cannot be chosen.</div>'
          : ''
      }
    </div>`;
}

// Attaches the behaviour. onChange(material or null) is called whenever the
// choice changes. Returns { setValue(id) } for preselecting a material.
export function wireMaterialPicker(scope, materials, onChange = () => {}) {
  const root = $('[data-picker]', scope);
  if (!root) return { setValue() {} };

  const type = root.dataset.type;
  const hidden = root.querySelector('input[name="materialId"]');
  const input = root.querySelector('[role="combobox"]');
  const list = root.querySelector('[role="listbox"]');

  let shown = [];
  let active = -1;
  let chosen = null;

  const isDisabled = (material) => type === 'out' && (Number(material.stockQuantity) || 0) === 0;
  const optionId = (index) => `${list.id}-opt-${index}`;

  function draw() {
    shown = filterMaterials(materials, chosen && input.value === chosen.name ? '' : input.value);

    if (shown.length === 0) {
      list.innerHTML = '<li class="cb-picker-empty" role="presentation">No material matches that search.</li>';
      return;
    }

    list.innerHTML = shown
      .map((material, index) => {
        const stock = Number(material.stockQuantity) || 0;
        const disabled = isDisabled(material);
        return `
          <li id="${optionId(index)}" role="option" class="cb-picker-option${index === active ? ' is-active' : ''}"
              data-index="${index}"
              aria-selected="${chosen?.id === material.id}"
              ${disabled ? 'aria-disabled="true"' : ''}>
            <span class="cb-picker-name">${esc(material.name)}</span>
            <span class="cb-picker-meta">
              ${esc(categoryLabel(material.category))} &middot;
              ${disabled ? 'out of stock' : `${stock} ${esc(material.unit)} in stock`}
            </span>
          </li>`;
      })
      .join('');
  }

  function open() {
    draw();
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    list.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function highlight(index) {
    if (shown.length === 0) return;
    active = (index + shown.length) % shown.length;
    draw();
    input.setAttribute('aria-activedescendant', optionId(active));
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }

  function choose(material) {
    if (!material || isDisabled(material)) return;
    chosen = material;
    hidden.value = material.id;
    input.value = material.name;
    close();
    onChange(material);
  }

  input.addEventListener('focus', open);
  input.addEventListener('click', open);

  input.addEventListener('input', () => {
    // Typing after a choice starts a new search, so the old choice is let go
    if (chosen && input.value !== chosen.name) {
      chosen = null;
      hidden.value = '';
      onChange(null);
    }
    active = -1;
    open();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (list.hidden) open();
      highlight(active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) open();
      highlight(active - 1);
    } else if (event.key === 'Enter') {
      // Enter chooses rather than submitting the form while the list is open
      if (!list.hidden) {
        event.preventDefault();
        if (active >= 0) choose(shown[active]);
        else if (shown.length === 1) choose(shown[0]);
      }
    } else if (event.key === 'Escape') {
      if (!list.hidden) {
        event.preventDefault();
        close();
      } else if (input.value && !chosen) {
        input.value = '';
      }
    }
  });

  // mousedown rather than click, so the choice is made before the text box
  // loses focus and closes the list
  list.addEventListener('mousedown', (event) => {
    const option = event.target.closest('[role="option"]');
    if (!option) return;
    event.preventDefault();
    choose(shown[Number(option.dataset.index)]);
  });

  input.addEventListener('blur', () => {
    close();
    // Leaving half-typed text would look like a choice that was not made
    if (!chosen) input.value = '';
    else input.value = chosen.name;
  });

  return {
    setValue(id) {
      const material = materials.find((m) => m.id === id);
      if (material) choose(material);
    },
  };
}
