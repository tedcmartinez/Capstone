// The stock movement form
//
// One module builds the fields for both stock-in and stock-out, and for both
// places they appear: the full page reached from the sidebar, and the modal
// on each row of the materials catalog. The PHP version had the same
// arrangement, with the modal posting to the same route as the page, so the
// validation and the stock arithmetic could not drift apart between them.

import { esc, $, $$, alertHtml, todayIso, shortDate } from '../lib/dom.js';
import {
  allowedReasons,
  reasonLabel,
  validateMovement,
  logMovement,
  missingRequirements,
  loadProjectSuggestions,
} from '../lib/movements.js';
import { projectRequired, notesRequired, receiptRequired, PROJECT_MAX } from '../lib/reasons.js';
import { materialPickerHtml, wireMaterialPicker } from './material-picker.js';
import { compressReceipt, formatSize } from '../lib/receipts.js';
import { requestStockCheck, describeAlertResult } from '../lib/alerts.js';
import { RECEIPT_MAX_BYTES } from '../lib/config.js';
import { QUEUED } from '../lib/sync.js';

// ============================================================
// FIELDS
// ============================================================

// The material picker. On the catalog modal the material is already known,
// so it is shown as a fixed panel instead of a dropdown.
function materialField(type, materials, fixedMaterial) {
  if (fixedMaterial) {
    return `
      <input type="hidden" name="materialId" value="${esc(fixedMaterial.id)}">
      <div class="cb-stock-panel">
        <span class="cb-label">Current Stock</span>
        <span class="cb-stock-panel-num">
          ${Number(fixedMaterial.stockQuantity) || 0}
          <span class="text-muted" style="font-size:13px;font-weight:500;">${esc(fixedMaterial.unit)}</span>
        </span>
      </div>`;
  }

  // Stock-out cannot take from an empty material, so those are shown but
  // cannot be chosen, exactly as stockout.php disabled them
  return materialPickerHtml(type);
}

// The marker on a field that must be filled in. aria-hidden because the
// field itself carries aria-required, which is what a screen reader says.
const REQUIRED = '<span class="cb-required" aria-hidden="true">*</span>';
const OPTIONAL = '<span class="text-muted">(optional)</span>';

export function stockFormFields(type, materials, fixedMaterial = null) {
  const isIn = type === 'in';

  return `
    <div id="sfErrors"></div>

    ${materialField(type, materials, fixedMaterial)}

    <div class="cb-field">
      <label class="cb-field-label">${isIn ? 'Quantity Received' : 'Quantity Removed'}</label>
      <div class="cb-stepper">
        <button type="button" data-step="down" aria-label="Decrease">&minus;</button>
        <input type="number" name="quantity" value="1" min="1" step="1" required>
        <button type="button" data-step="up" aria-label="Increase">+</button>
      </div>
      ${
        isIn
          ? ''
          : '<div class="cb-help">The server rejects any amount larger than the stock on hand.</div>'
      }
    </div>

    <div class="row">
      <div class="col-md-6">
        <div class="cb-field">
          <label class="cb-field-label" for="sfReason">Reason</label>
          <select name="reason" id="sfReason" class="cb-select w-100">
            ${allowedReasons(type)
              .map((reason) => `<option value="${esc(reason)}">${esc(reasonLabel(reason))}</option>`)
              .join('')}
          </select>
        </div>
      </div>
      <div class="col-md-6">
        ${
          isIn
            ? `
        <div class="cb-field">
          <label class="cb-field-label" for="sfReference">Reference ${OPTIONAL}</label>
          <input type="text" name="reference" id="sfReference" class="cb-input"
                 placeholder="e.g. PO-1042">
        </div>`
            : `
        <div class="cb-field">
          <label class="cb-field-label" for="sfProject">
            Project <span id="sfProjectMark">${REQUIRED}</span>
          </label>
          <input type="text" name="project" id="sfProject" class="cb-input"
                 list="sfProjectList" maxlength="${PROJECT_MAX}" autocomplete="off"
                 aria-required="true" aria-describedby="sfProjectHelp"
                 placeholder="e.g. Sofa set for Ms. Reyes">
          <datalist id="sfProjectList"></datalist>
          <div class="cb-field-error" id="sfProjectHelp"></div>
        </div>`
        }
      </div>
    </div>

    <div class="cb-field">
      <label class="cb-field-label">Date</label>
      <!-- Display only. The date is stamped by the app when the movement is
           saved, so it cannot be changed or backdated, which is the rule the
           LAN version set and the one kept here. -->
      <input type="text" class="cb-input" value="${esc(shortDate(todayIso()))}" disabled>
      <div class="cb-help">Recorded automatically as today's date.</div>
    </div>

    <div class="cb-field">
      <label class="cb-field-label" for="sfNotes">Notes <span id="sfNotesMark">${OPTIONAL}</span></label>
      <textarea name="notes" id="sfNotes" class="cb-textarea" rows="3"
                aria-describedby="sfNotesHelp"></textarea>
      <div class="cb-field-error" id="sfNotesHelp"></div>
    </div>

    ${
      isIn
        ? `
    <div class="cb-field mb-0">
      <label class="cb-field-label" for="sfReceipt">Receipt Photo ${REQUIRED}</label>
      <input type="file" name="receipt" id="sfReceipt" class="cb-input"
             accept="image/jpeg,image/png,image/webp"
             aria-required="true" aria-describedby="sfReceiptHelp">
      <div class="cb-help">
        JPG, PNG or WEBP. Large images are shrunk automatically to fit the
        ${formatSize(RECEIPT_MAX_BYTES)} limit.
      </div>
      <div class="cb-field-error" id="sfReceiptHelp"></div>
      <div id="sfReceiptStatus"></div>
    </div>`
        : ''
    }`;
}

// ============================================================
// BEHAVIOUR
// ============================================================

// The quantity stepper, ported from public/js/app.js. The input keeps its
// own min and max, so the buttons only nudge the value within range.
export function wireSteppers(scope) {
  $$('.cb-stepper', scope).forEach((stepper) => {
    const input = stepper.querySelector('input');
    const nudge = (amount) => {
      const min = input.min !== '' ? parseInt(input.min, 10) : 1;
      const max = input.max !== '' ? parseInt(input.max, 10) : Infinity;
      let next = (parseInt(input.value, 10) || min) + amount;
      if (next < min) next = min;
      if (next > max) next = max;
      input.value = next;
    };

    stepper.querySelector('[data-step="down"]')?.addEventListener('click', () => nudge(-1));
    stepper.querySelector('[data-step="up"]')?.addEventListener('click', () => nudge(1));
  });
}

// Compresses the chosen receipt as soon as it is picked, rather than waiting
// for the form to be submitted. Two reasons: the user finds out immediately
// if the image is unusable, and the saved size is shown so the compression
// is visible rather than something that happened silently.
export function wireReceiptPicker(scope, onReady) {
  const input = $('#sfReceipt', scope);
  if (!input) return;

  const status = $('#sfReceiptStatus', scope);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];

    if (!file) {
      onReady(null);
      status.innerHTML = '';
      return;
    }

    status.innerHTML = '<div class="cb-help">Preparing the image...</div>';

    try {
      const receipt = await compressReceipt(file);
      onReady(receipt);

      status.innerHTML = `
        <div class="cb-help" style="color: var(--cb-green);">
          Ready: ${formatSize(receipt.originalBytes)} reduced to
          ${formatSize(receipt.sizeBytes)}, ${receipt.width} by ${receipt.height} pixels.
        </div>`;
    } catch (error) {
      onReady(null);
      input.value = '';
      status.innerHTML = alertHtml('danger', error.message);
    }
  });
}

// ============================================================
// REQUIREMENTS
//
// The form keeps Confirm switched off until everything the rules require is
// there: a receipt photo on a stock-in, a project on a stock-out (unless
// Damaged), and notes when the reason is Other. Each missing item says what
// it needs right under its field. Changing the reason updates the labels at
// once and never clears what has been typed.
//
// getReceipt() reports whether a compressed receipt is ready.
// Returns refresh(), which the caller runs after the receipt changes.
// ============================================================

export function wireRequirements(form, type, saveButton, getReceipt) {
  const reasonSelect = form.reason;
  const hint = (id) => form.querySelector(`#${id}`);

  // Messages appear only once someone has had the chance to fill a field,
  // so a fresh form is not covered in red before anything is typed
  const touched = new Set();

  function refresh() {
    const reason = reasonSelect.value;
    const missing = missingRequirements({
      type,
      reason,
      project: form.project?.value,
      notes: form.notes.value,
      hasReceipt: Boolean(getReceipt()),
    });

    // Project: required unless Damaged
    const projectMark = hint('sfProjectMark');
    if (projectMark) {
      const required = projectRequired(type, reason);
      projectMark.innerHTML = required ? REQUIRED : OPTIONAL;
      form.project.setAttribute('aria-required', String(required));
    }

    // Notes: required when the reason is Other
    const notesRequiredNow = notesRequired(type, reason);
    hint('sfNotesMark').innerHTML = notesRequiredNow ? REQUIRED : OPTIONAL;
    form.notes.setAttribute('aria-required', String(notesRequiredNow));
    form.notes.placeholder = notesRequiredNow
      ? `Explain the reason for this ${type === 'in' ? 'stock-in' : 'stock-out'}.`
      : '';

    show('sfProjectHelp', 'project', missing.project);
    show('sfNotesHelp', 'notes', missing.notes);
    show('sfReceiptHelp', 'receipt', missing.receipt);

    const materialChosen = Boolean(form.materialId.value);
    saveButton.disabled = !materialChosen || Object.keys(missing).length > 0;
  }

  function show(id, field, text) {
    const target = hint(id);
    if (!target) return;
    // The receipt message shows from the start: without it, a switched-off
    // Confirm button would give no clue why
    const visible = text && (field === 'receipt' || touched.has(field));
    target.textContent = visible ? text : '';
  }

  const touch = (field) => () => {
    touched.add(field);
    refresh();
  };

  reasonSelect.addEventListener('change', refresh);
  form.project?.addEventListener('input', refresh);
  form.project?.addEventListener('blur', touch('project'));
  form.notes.addEventListener('input', refresh);
  form.notes.addEventListener('blur', touch('notes'));

  // Choosing Other or a reason that needs a project makes those fields
  // count as touched, so the reason for a switched-off Confirm is shown
  reasonSelect.addEventListener('change', () => {
    if (notesRequired(type, reasonSelect.value)) touched.add('notes');
    refresh();
  });

  refresh();
  return refresh;
}

// Fills the Project field's suggestions. Best effort: offline or on any
// error the field still works, just without suggestions.
export async function fillProjectSuggestions(form) {
  const list = form.querySelector('#sfProjectList');
  if (!list) return;

  try {
    const projects = await loadProjectSuggestions();
    list.innerHTML = projects.map((project) => `<option value="${esc(project)}"></option>`).join('');
  } catch (error) {
    console.warn('Could not load project suggestions:', error);
  }
}

export { wireMaterialPicker };

// ============================================================
// SAVING
//
// Shared by the page and the modal so the two cannot behave differently.
// Returns { ok, message, alertMessage } for the caller to display.
// ============================================================

export async function submitStockForm({ form, type, materials, receipt, fixedMaterial }) {
  const materialId = fixedMaterial ? fixedMaterial.id : form.materialId.value;
  const material = fixedMaterial || materials.find((m) => m.id === materialId);
  const quantity = form.quantity.value;

  const reason = form.reason.value;
  const project = form.project ? form.project.value.trim() : '';
  const notes = form.notes.value.trim();

  const errors = validateMovement({
    materialId,
    quantity,
    type,
    material,
    reason,
    project,
    notes,
    hasReceipt: Boolean(receipt) || !receiptRequired(type),
  });
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const result = await logMovement({
    type,
    material,
    quantity,
    reason,
    reference: form.reference ? form.reference.value.trim() : '',
    project,
    notes,
    receipt: type === 'in' ? receipt : null,
  });

  const amount = Number(quantity);
  const verb = type === 'in' ? 'added to' : 'removed from';

  // The wording depends on whether the server has actually taken it. Saying
  // "saved" for a write that is still queued would be a claim the system
  // cannot stand behind, and if that write is later refused the user needs
  // to recognise which entry the failure notice is about.
  const message =
    result.status === QUEUED
      ? {
          kind: 'info',
          text:
            `${amount} ${material.unit} ${verb} ${material.name}, saved on this ` +
            'computer and waiting to reach the server. It will sync when the ' +
            'connection returns, and you will be told here if it does not.',
        }
      : {
          kind: 'success',
          text:
            `${amount} ${material.unit} ${verb} ${material.name}. ` +
            `Stock is now ${result.afterQty} ${material.unit}.` +
            (result.receiptId ? ' The receipt image was attached.' : ''),
        };

  // Only a stock-out can take a material below its threshold, so that is
  // the only case where the alert check runs. This mirrors the PHP version,
  // which called checkAndNotify() after a stock-out and nowhere else.
  // The alert service reads the material from Firestore itself, so there is
  // no point asking it about a movement the server has not accepted yet. A
  // queued stock-out gets its alert when it syncs, on the next stock-out, or
  // from the manager noticing it on the dashboard.
  let alertMessage = null;
  if (type === 'out' && result.status !== QUEUED) {
    const alertResult = await requestStockCheck(material.id);
    alertMessage = describeAlertResult(alertResult, material.name);
  }

  return { ok: true, message, alertMessage, result };
}
