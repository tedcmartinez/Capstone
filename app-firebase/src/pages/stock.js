// Stock In and Stock Out pages
//
// A port of app/views/movements/stockin.php and stockout.php. Both are built
// from the same function, because the two pages differed only in their
// wording, their reason list, the receipt field, and the direction of the
// arithmetic, exactly as logMovement() in the PHP controller handled both.

import { esc, render, $, alertHtml, friendlyError } from '../lib/dom.js';
import { lowStockOf, loadCatalog } from '../lib/materials.js';
import {
  stockFormFields,
  wireSteppers,
  wireReceiptPicker,
  submitStockForm,
} from '../ui/stock-form.js';
import { updateAlerts } from '../ui/shell.js';
import { queryParam, navigate } from '../lib/router.js';

export const renderStockIn = (container) => renderStockPage(container, 'in');
export const renderStockOut = (container) => renderStockPage(container, 'out');

let materials = [];
let receipt = null;
let messages = [];

async function renderStockPage(container, type) {
  const isIn = type === 'in';
  const title = isIn ? 'Stock In' : 'Stock Out';

  receipt = null;

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">${title}</h1>
        <p class="cb-page-sub">Loading materials...</p>
      </div>
    </div>`);

  let catalog;
  try {
    catalog = await loadCatalog();
    materials = catalog.materials;
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">${title}</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  updateAlerts(lowStockOf(materials));

  draw(container, type);
}

function draw(container, type) {
  const isIn = type === 'in';
  const title = isIn ? 'Stock In' : 'Stock Out';
  const subtitle = isIn
    ? 'Record materials received into the warehouse'
    : 'Record materials withdrawn for production';

  // A material may be preselected, which is how the catalog's row buttons
  // and the dashboard's low-stock list hand over to this page.
  const preselected = queryParam('material');

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">${title}</h1>
        <p class="cb-page-sub">${subtitle}</p>
      </div>
      <a href="/movements" class="cb-btn cb-btn-outline">Back to History</a>
    </div>

    ${messages.map((m) => alertHtml(m.kind, m.text)).join('')}

    <div class="row">
      <div class="col-12 col-lg-7">
        <div class="cb-card">
          <div class="cb-card-body">
            <form id="sfForm" novalidate>
              ${stockFormFields(type, materials)}

              <div class="d-flex gap-2 mt-4">
                <button type="submit" class="cb-btn ${isIn ? 'cb-btn-in' : 'cb-btn-out'}" id="sfSave">
                  Confirm ${title}
                </button>
                <a href="/movements" class="cb-btn cb-btn-outline">Cancel</a>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-5">
        ${sidePanel(type)}
      </div>
    </div>
  `);

  messages = [];

  const form = $('#sfForm', container);

  if (preselected && form.materialId) {
    form.materialId.value = preselected;
  }

  wireSteppers(form);
  wireReceiptPicker(form, (ready) => {
    receipt = ready;
  });

  form.addEventListener('submit', (event) => save(event, container, type));
}

// The explanatory panel beside the form, kept from the PHP pages. It tells a
// new user what the form will do, which matters for a client who has never
// used a system before.
function sidePanel(type) {
  const isIn = type === 'in';

  const points = isIn
    ? [
        'The quantity must be greater than zero.',
        'The date is recorded as today and cannot be backdated.',
        'A receipt photo can be attached for the manager’s records.',
        'Once saved, the catalog and dashboard totals update straight away.',
      ]
    : [
        'The quantity must be greater than zero.',
        'You cannot remove more than the stock on hand.',
        'The date is recorded as today and cannot be backdated.',
        'Crossing the minimum threshold emails a low-stock alert.',
      ];

  return `
    <div class="cb-card">
      <div class="cb-card-head">
        <h2 class="cb-section-title">How this works</h2>
      </div>
      <div class="cb-card-body">
        <p class="text-muted mb-3" style="font-size:13px;">
          ${
            isIn
              ? 'Stock In adds to a material’s running total and creates a permanent entry in the movement history.'
              : 'Stock Out subtracts from a material’s running total and creates a permanent entry in the movement history.'
          }
        </p>
        <ul class="text-muted mb-0" style="font-size:13px;padding-left:18px;line-height:1.9;">
          ${points.map((point) => `<li>${point}</li>`).join('')}
        </ul>
      </div>
    </div>`;
}

async function save(event, container, type) {
  event.preventDefault();

  const form = event.target;
  const button = $('#sfSave', container);
  const errorBox = $('#sfErrors', container);
  const originalText = button.textContent.trim();

  button.disabled = true;
  button.textContent = 'Saving...';
  errorBox.innerHTML = '';

  try {
    const outcome = await submitStockForm({ form, type, materials, receipt });

    if (!outcome.ok) {
      errorBox.innerHTML = outcome.errors.map((error) => alertHtml('danger', error)).join('');
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    // Both the confirmation and anything the alert service reported are
    // carried over to the history page, which is where the PHP version
    // redirected after saving.
    messages = [outcome.message];
    if (outcome.alertMessage) messages.push(outcome.alertMessage);

    navigate('/movements');
  } catch (error) {
    errorBox.innerHTML = alertHtml('danger', friendlyError(error));
    button.disabled = false;
    button.textContent = originalText;
  }
}

// Lets the history page collect the messages left by a save here
export function takeStockMessages() {
  const taken = messages;
  messages = [];
  return taken;
}
