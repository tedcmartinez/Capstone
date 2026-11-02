// A confirmation dialog in the app's own style
//
// window.confirm() shows the browser's grey box with OK and Cancel, which
// cannot say what OK does or show a destructive action in red. This is the
// same question in a Bootstrap modal, with the action named on its button.
//
//   const yes = await confirmDialog({
//     title: 'Delete account',
//     text: 'Delete Maria Santos?',
//     confirmLabel: 'Delete',
//     danger: true,
//   });
//
// Resolves true for the action button, false for Cancel, Esc or clicking
// outside. The dialog is attached to <body>, not the page, so a page that
// redraws while it is open does not take it away.

import { esc } from '../lib/dom.js';

export function confirmDialog({ title, text, confirmLabel = 'Confirm', danger = false }) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal fade" tabindex="-1" aria-labelledby="cbConfirmTitle" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title cb-section-title" id="cbConfirmTitle">${esc(title)}</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="mb-0">${esc(text)}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="cb-btn ${danger ? 'cb-btn-danger' : 'cb-btn-primary'}" data-confirm>
              ${esc(confirmLabel)}
            </button>
          </div>
        </div>
      </div>
    </div>`;

  const element = wrapper.firstElementChild;
  document.body.appendChild(element);

  const modal = new window.bootstrap.Modal(element);

  return new Promise((resolve) => {
    let answer = false;

    element.querySelector('[data-confirm]').addEventListener('click', () => {
      answer = true;
      modal.hide();
    });

    // Resolved only once the dialog has finished closing, so whatever the
    // caller does next never competes with the closing animation
    element.addEventListener(
      'hidden.bs.modal',
      () => {
        modal.dispose();
        element.remove();
        resolve(answer);
      },
      { once: true }
    );

    modal.show();
  });
}
