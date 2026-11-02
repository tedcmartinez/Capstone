// Categories overview
//
// A port of app/views/categories/index.php. A category is still a plain text
// field on each material rather than a collection of its own, so this page
// groups the catalog exactly as the PHP version grouped it with SQL. That is
// why firestore.rules has no categories section: there is nothing to secure.
//
// Both roles may open this page, but the Value figure is manager only. For
// staff it is not merely hidden: the costs it adds up are in a collection
// the rules will not let them read, so there is no number to show.

import { esc, render, pesoShort, alertHtml, friendlyError } from '../lib/dom.js';
import { loadCatalog, categoryStats, lowStockOf } from '../lib/materials.js';
import { categoryLabel } from '../lib/format.js';
import { isManager } from '../lib/session.js';
import { updateAlerts } from '../ui/shell.js';

export async function renderCategories(container) {
  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Categories</h1>
        <p class="cb-page-sub">Loading the catalog...</p>
      </div>
    </div>`);

  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">Categories</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  updateAlerts(lowStockOf(catalog.materials));

  const stats = categoryStats(catalog.materials);
  const totalItems = stats.reduce((sum, row) => sum + row.itemCount, 0);
  const manager = isManager();

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Categories</h1>
        <p class="cb-page-sub">
          ${stats.length} categor${stats.length === 1 ? 'y' : 'ies'}
          covering ${totalItems} material${totalItems === 1 ? '' : 's'}
        </p>
      </div>
      <a href="/materials" class="cb-btn cb-btn-primary">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
        Add Material
      </a>
    </div>

    ${stats.length === 0 ? emptyState() : cards(stats, manager)}
  `);
}

function emptyState() {
  return `
    <div class="cb-card">
      <div class="cb-empty">
        <div class="cb-empty-icon">
          <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M2 2a1 1 0 0 1 1-1h3.5a1 1 0 0 1 .8.4l.9 1.2a1 1 0 0 0 .8.4H13a1 1 0 0 1 1 1v1H2z"/><path d="M1.5 5h13a.5.5 0 0 1 .5.55l-.8 8A1.5 1.5 0 0 1 12.7 15H3.3a1.5 1.5 0 0 1-1.5-1.45l-.8-8A.5.5 0 0 1 1.5 5"/></svg>
        </div>
        <div class="cb-empty-title">No categories yet</div>
        <p class="cb-empty-text">Categories appear here once you add materials to the catalog.</p>
      </div>
    </div>`;
}

// One card per category, each linking into the materials list filtered to it
function cards(stats, manager) {
  return `
    <div class="row g-3">
      ${stats.map((row) => card(row, manager)).join('')}
    </div>`;
}

function card(row, manager) {
  const needsAttention = row.outCount + row.lowCount;

  return `
    <div class="col-12 col-md-6 col-xl-4">
      <a class="cb-card h-100 d-block text-decoration-none"
         href="/materials?category=${encodeURIComponent(row.category)}">
        <div class="cb-card-body">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div>
              <div class="cb-cell-name" style="font-size:15px;">${esc(categoryLabel(row.category))}</div>
              <div class="cb-cell-sub">${row.itemCount} material${row.itemCount === 1 ? '' : 's'}</div>
            </div>
            <span class="cb-kpi-icon">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2 2a1 1 0 0 1 1-1h3.5a1 1 0 0 1 .8.4l.9 1.2a1 1 0 0 0 .8.4H13a1 1 0 0 1 1 1v1H2z"/><path d="M1.5 5h13a.5.5 0 0 1 .5.55l-.8 8A1.5 1.5 0 0 1 12.7 15H3.3a1.5 1.5 0 0 1-1.5-1.45l-.8-8A.5.5 0 0 1 1.5 5"/></svg>
            </span>
          </div>

          <div class="d-flex gap-4 mb-3">
            <div>
              <div class="cb-label">Total Stock</div>
              <div class="cb-health-num">${row.totalStock.toLocaleString('en-PH')}</div>
            </div>
            ${
              manager
                ? `<div>
                     <div class="cb-label">Value</div>
                     <div class="cb-health-num" style="font-size:17px;">${esc(pesoShort(row.totalValue))}</div>
                   </div>`
                : ''
            }
          </div>

          ${
            needsAttention === 0
              ? '<span class="cb-badge is-healthy">All Healthy</span>'
              : `<div class="d-flex gap-2 flex-wrap">
                   ${row.outCount > 0 ? `<span class="cb-badge is-out">${row.outCount} Out of Stock</span>` : ''}
                   ${row.lowCount > 0 ? `<span class="cb-badge is-low">${row.lowCount} Low Stock</span>` : ''}
                 </div>`
          }
        </div>
      </a>
    </div>`;
}
