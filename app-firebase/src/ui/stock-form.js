// The stock movement form
//
// One module builds the fields for both stock-in and stock-out, and for both
// places they appear: the full page reached from the sidebar, and the modal
// on each row of the materials catalog. The PHP version had the same
// arrangement, with the modal posting to the same route as the page, so the
// validation and the stock arithmetic could not drift apart between them.

import { esc, $, $$, alertHtml, friendlyError, todayIso, shortDate } from '../lib/dom.js';
import { allowedReasons, reasonLabel, validateMovement, logMovement } from '../lib/movements.js';
import { compressReceipt, formatSize } from '../lib/receipts.js';
import { requestStockCheck, describeAlertResult } from '../lib/alerts.js';
import { RECEIPT_MAX_BYTES } from '../lib/config.js';

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

  // Stock-out cannot take from an empty material, so those options are
  // disabled and labelled, exactly as stockout.php did.
  const options = materials
    .map((material) => {
      const stock = Number(material.stockQuantity) || 0;
      const empty = stock === 0;
      const disabled = type === 'out' && empty;

      return `
        <option value="${esc(material.id)}"${disabled ? ' disabled' : ''}>
          ${esc(material.name)} (${stock} ${esc(material.unit)} in stock)${
            type === 'out' && empty ? ' - out of stock' : ''
          }
        </option>`;
    })
    .join('');

  return `
    <div class="cb-field">
      <label class="cb-field-label" for="sfMaterial">Material</label>
      <select name="materialId" id="sfMaterial" class="cb-select w-100" required>
        <option value="">-- Select material --</option>
        ${options}
      </select>
      ${
        type === 'out'
          ? '<div class="cb-help">Materials with no stock left cannot be selected.</div>'
          : ''
      }
    </div>`;
}

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
        <div class="cb-field">
          <label class="cb-field-label" for="sfReference">
            ${isIn ? 'Reference' : 'Project'} <span class="text-muted">(optional)</span>
          </label>
          <input type="text" name="reference" id="sfReference" class="cb-input"
                 placeholder="${isIn ? 'e.g. PO-1042' : 'e.g. Sofa set for Ms. Reyes'}">
        </div>
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
      <label class="cb-field-label" for="sfNotes">Notes <span class="text-muted">(optional)</span></label>
      <textarea name="notes" id="sfNotes" class="cb-textarea" rows="${isIn ? 3 : 3}"></textarea>
    </div>

    ${
      isIn
        ? `
    <div class="cb-field mb-0">
      <label class="cb-field-label" for="sfReceipt">Receipt Photo <span class="text-muted">(optional)</span></label>
      <input type="file" name="receipt" id="sfReceipt" class="cb-input"
             accept="image/jpeg,image/png,image/webp">
      <div class="cb-help">
        JPG, PNG or WEBP. Large images are shrunk automatically to fit the
        ${formatSize(RECEIPT_MAX_BYTES)} limit.
      </div>
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
// SAVING
//
// Shared by the page and the modal so the two cannot behave differently.
// Returns { ok, message, alertMessage } for the caller to display.
// ============================================================

export async function submitStockForm({ form, type, materials, receipt, fixedMaterial }) {
  const materialId = fixedMaterial ? fixedMaterial.id : form.materialId.value;
  const material = fixedMaterial || materials.find((m) => m.id === materialId);
  const quantity = form.quantity.value;

  const errors = validateMovement({ materialId, quantity, type, material });
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const result = await logMovement({
    type,
    material,
    quantity,
    reason: form.reason.value,
    reference: form.reference.value.trim(),
    notes: form.notes.value.trim(),
    receipt: type === 'in' ? receipt : null,
  });

  const amount = Number(quantity);
  const verb = type === 'in' ? 'added to' : 'removed from';

  const message = {
    kind: 'success',
    text:
      `${amount} ${material.unit} ${verb} ${material.name}. ` +
      `Stock is now ${result.afterQty} ${material.unit}.` +
      (result.receiptId ? ' The receipt image was attached.' : ''),
  };

  // Only a stock-out can take a material below its threshold, so that is
  // the only case where the alert check runs. This mirrors the PHP version,
  // which called checkAndNotify() after a stock-out and nowhere else.
  let alertMessage = null;
  if (type === 'out') {
    const alertResult = await requestStockCheck(material.id);
    alertMessage = describeAlertResult(alertResult, material.name);
  }

  return { ok: true, message, alertMessage, result };
}
