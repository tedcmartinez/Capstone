// The Audit Trail
//
// Every change anybody has made to the system, newest first. There was no
// equivalent in the LAN version, which kept no history of edits at all: a
// changed threshold or cost simply overwrote the old value, and nobody could
// say afterwards who changed it or what it had been.
//
// Manager and webmaster only. The entries are append only, enforced in
// firestore.rules for every role including the webmaster, so this page can
// show the trail but nothing anywhere can rewrite it.

import {
  esc,
  render,
  $,
  $$,
  longDateTime,
  alertHtml,
  friendlyError,
} from '../lib/dom.js';
import {
  AUDIT_ACTION_GROUPS,
  actionLabel,
  isKnownAction,
  loadAuditPage,
  loadAllAudit,
  loadAuditFilterOptions,
  diffRows,
  exportRows,
  exportTitle,
  exportFileName,
  toCsv,
  describeFilters,
  EXPORT_HEADER,
  EXPORT_CEILING,
} from '../lib/auditTrail.js';
import {
  canExportToSheets,
  exportToSheets,
  downloadCsv,
  SheetsDeclined,
  SheetsNotEnabled,
} from '../lib/sheets.js';
import { auditedWrite } from '../lib/audit.js';
import { allQueryParams } from '../lib/router.js';
import { ROLE_LABELS, PAGE_SIZE } from '../lib/config.js';

let container = null;
let options = { users: [], materials: [] };
let filters = { dateFrom: '', dateTo: '', actorUid: '', action: '', materialId: '' };
let page = { entries: [], hasMore: false, lastDoc: null };
let cursors = [];
let pageIndex = 0;
let notice = null;

export async function renderAudit(target) {
  container = target;

  const params = allQueryParams();
  filters = {
    dateFrom: params.from || '',
    dateTo: params.to || '',
    actorUid: params.user || '',
    action: isKnownAction(params.action) ? params.action : '',
    materialId: params.material || '',
  };

  cursors = [];
  pageIndex = 0;

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Audit Trail</h1>
        <p class="cb-page-sub">Loading the record of changes...</p>
      </div>
    </div>`);

  try {
    [options, page] = await Promise.all([loadAuditFilterOptions(), loadAuditPage(filters)]);
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">Audit Trail</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  draw();
}

// ============================================================
// DRAWING
// ============================================================

function hasFilters() {
  return Boolean(
    filters.dateFrom || filters.dateTo || filters.actorUid || filters.action || filters.materialId
  );
}

function draw() {
  const sheetsAvailable = canExportToSheets();

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Audit Trail</h1>
        <p class="cb-page-sub">
          Every change recorded in the system, newest first. Entries cannot be
          edited or deleted by anyone.
        </p>
      </div>
      <div class="d-flex gap-2 flex-wrap">
        ${
          sheetsAvailable
            ? `<button type="button" class="cb-btn cb-btn-primary" id="auExportSheets">
                 Export to Google Sheets
               </button>`
            : ''
        }
        <button type="button" class="cb-btn cb-btn-outline" id="auExportCsv">
          Download CSV
        </button>
      </div>
    </div>

    <div id="auNotice">${noticeHtml()}</div>

    ${filterBar()}

    <div class="cb-card">
      <div class="cb-card-body is-flush">
        ${page.entries.length === 0 ? emptyState() : table()}
      </div>
      ${page.entries.length === 0 ? '' : pager()}
    </div>

    ${detailModal()}
  `);

  wire();
}

function filterBar() {
  const userOptions = options.users
    .map(
      (user) =>
        `<option value="${esc(user.id)}"${filters.actorUid === user.id ? ' selected' : ''}>
           ${esc(user.name || user.email)}
         </option>`
    )
    .join('');

  // Grouped, so a list of twenty actions reads as four short lists
  const actionOptions = AUDIT_ACTION_GROUPS.map(
    (group) => `
      <optgroup label="${esc(group.label)}">
        ${Object.entries(group.actions)
          .map(
            ([value, label]) =>
              `<option value="${esc(value)}"${filters.action === value ? ' selected' : ''}>${esc(label)}</option>`
          )
          .join('')}
      </optgroup>`
  ).join('');

  const materialOptions = options.materials
    .map(
      (material) =>
        `<option value="${esc(material.id)}"${filters.materialId === material.id ? ' selected' : ''}>
           ${esc(material.name)}${material.isArchived ? ' (archived)' : ''}
         </option>`
    )
    .join('');

  return `
    <form class="cb-filters mb-3" id="auFilters">
      <input type="date" name="from" class="cb-input" value="${esc(filters.dateFrom)}"
             aria-label="From date" title="From date">
      <input type="date" name="to" class="cb-input" value="${esc(filters.dateTo)}"
             aria-label="To date" title="To date">

      <select name="user" class="cb-select">
        <option value="">All Users</option>
        ${userOptions}
      </select>

      <select name="action" class="cb-select">
        <option value="">All Actions</option>
        ${actionOptions}
      </select>

      <select name="material" class="cb-select">
        <option value="">All Materials</option>
        ${materialOptions}
      </select>

      ${hasFilters() ? '<button type="button" class="cb-btn cb-btn-outline" id="auClear">Clear</button>' : ''}
    </form>`;
}

function emptyState() {
  return `
    <div class="cb-empty">
      <div class="cb-empty-icon">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5z"/></svg>
      </div>
      <div class="cb-empty-title">
        ${hasFilters() ? 'No entries match these filters' : 'Nothing recorded yet'}
      </div>
      <p class="cb-empty-text">
        ${hasFilters()
          ? 'Try widening the dates, or clearing a filter above.'
          : 'Every change made in the system will appear here as it happens.'}
      </p>
    </div>`;
}

function table() {
  return `
    <div class="cb-table-wrap">
      <table class="cb-table">
        <thead>
          <tr>
            <th>When</th>
            <th>User</th>
            <th>Action</th>
            <th>Summary</th>
            <th class="cb-num">Details</th>
          </tr>
        </thead>
        <tbody>
          ${page.entries.map(row).join('')}
        </tbody>
      </table>
    </div>`;
}

// A colour per kind of action, so a page of stock movements and a sign-in
// can be told apart at a glance
function actionBadgeClass(action = '') {
  if (action.startsWith('stock.')) return 'is-brand';
  if (action.endsWith('.archive') || action === 'user.disable' || action === 'user.reject') return 'is-out';
  if (action.startsWith('auth.')) return 'is-neutral';
  return 'is-healthy';
}

function row(entry) {
  return `
    <tr>
      <td class="text-muted" style="white-space:nowrap;">${esc(longDateTime(entry.timestamp))}</td>
      <td>
        <div class="cb-cell-name">${esc(entry.actorName || entry.actorEmail || '(unknown)')}</div>
        <div class="cb-cell-sub">${esc(ROLE_LABELS[entry.actorRole] || entry.actorRole || '')}</div>
      </td>
      <td>
        <span class="cb-badge ${actionBadgeClass(entry.action)}">${esc(actionLabel(entry.action))}</span>
      </td>
      <td style="max-width:420px;">${esc(entry.summary || '')}</td>
      <td class="cb-num">
        <button type="button" class="cb-btn cb-btn-outline cb-btn-sm" data-entry="${esc(entry.id)}">
          View
        </button>
      </td>
    </tr>`;
}

function pager() {
  return `
    <div class="cb-card-foot d-flex justify-content-between align-items-center">
      <span class="cb-help mb-0">
        Page ${pageIndex + 1}, ${PAGE_SIZE} per page. The export includes every
        entry matching the filters, not only this page.
      </span>
      <div class="d-flex gap-2">
        <button type="button" class="cb-btn cb-btn-outline cb-btn-sm" id="auPrev"${pageIndex === 0 ? ' disabled' : ''}>
          Previous
        </button>
        <button type="button" class="cb-btn cb-btn-outline cb-btn-sm" id="auNext"${page.hasMore ? '' : ' disabled'}>
          Next
        </button>
      </div>
    </div>`;
}

// ============================================================
// THE DETAIL VIEW
// ============================================================

function detailModal() {
  return `
    <div class="modal fade" id="auDetailModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <div>
              <h5 class="modal-title" id="auDetailTitle">Entry</h5>
              <p class="cb-modal-sub" id="auDetailSub"></p>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="auDetailBody"></div>
        </div>
      </div>
    </div>`;
}

function showDetail(entryId) {
  const entry = page.entries.find((e) => e.id === entryId);
  if (!entry) return;

  $('#auDetailTitle', container).textContent = actionLabel(entry.action);
  $('#auDetailSub', container).textContent = longDateTime(entry.timestamp);

  const rows = diffRows(entry.before, entry.after);

  $('#auDetailBody', container).innerHTML = `
    <p class="mb-3" style="font-size:14px;">${esc(entry.summary || '')}</p>

    <dl class="cb-detail-list">
      <dt>By</dt>
      <dd>
        ${esc(entry.actorName || '(unknown)')}
        ${entry.actorEmail ? `<span class="text-muted">${esc(entry.actorEmail)}</span>` : ''}
      </dd>
      <dt>Role at the time</dt>
      <dd>${esc(ROLE_LABELS[entry.actorRole] || entry.actorRole || '(none)')}</dd>
      <dt>Record</dt>
      <dd><code>${esc(entry.entity || '')}${entry.entityId ? ` / ${esc(entry.entityId)}` : ''}</code></dd>
      <dt>App version</dt>
      <dd>${esc(entry.appVersion || '(unknown)')}</dd>
      <dt>Entry id</dt>
      <dd><code>${esc(entry.id)}</code></dd>
    </dl>

    ${
      rows.length === 0
        ? '<p class="cb-help mb-0">This entry records an event rather than a change to a record, so there is nothing to compare.</p>'
        : `
    <h6 class="cb-section-title mt-4 mb-2">What changed</h6>
    <div class="cb-table-wrap">
      <table class="cb-table cb-diff">
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th></th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr class="${r.changed ? 'is-changed' : ''}">
              <td class="cb-cell-name">${esc(r.label)}</td>
              <td class="cb-diff-before">${esc(r.before)}</td>
              <td class="cb-diff-arrow" aria-hidden="true">&rarr;</td>
              <td class="cb-diff-after">${esc(r.after)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`
    }`;

  window.bootstrap.Modal.getOrCreateInstance(document.querySelector('#auDetailModal')).show();
}

// ============================================================
// EXPORT
// ============================================================

function noticeHtml() {
  if (!notice) return '';

  if (notice.kind === 'sheets-done') {
    return `
      <div class="cb-alert is-success">
        <div>
          <strong>${notice.rowCount.toLocaleString('en-PH')} entries exported to Google Sheets.</strong>
          ${notice.truncated ? `<br>The export stopped at ${EXPORT_CEILING.toLocaleString('en-PH')} entries. Narrow the dates to export the rest.` : ''}
          <div class="mt-2">
            <a class="cb-btn cb-btn-primary cb-btn-sm" href="${esc(notice.url)}" target="_blank" rel="noopener">
              Open in Sheets
            </a>
          </div>
        </div>
      </div>`;
  }

  if (notice.kind === 'offer-csv') {
    return `
      <div class="cb-alert is-info">
        <div>
          ${esc(notice.text)}
          <div class="mt-2">
            <button type="button" class="cb-btn cb-btn-outline cb-btn-sm" id="auOfferCsv">
              Download CSV instead
            </button>
          </div>
        </div>
      </div>`;
  }

  return alertHtml(notice.kind, notice.text);
}

function showNotice(next) {
  notice = next;
  const target = $('#auNotice', container);
  if (target) target.innerHTML = noticeHtml();
  $('#auOfferCsv', container)?.addEventListener('click', () => runExport('csv'));
}

function setExportButtonsBusy(busy) {
  $$('#auExportSheets, #auExportCsv', container).forEach((button) => {
    button.disabled = busy;
  });
}

async function runExport(destination) {
  setExportButtonsBusy(true);
  showNotice({ kind: 'info', text: 'Reading the audit trail...' });

  // Every matching entry, not only the page on screen
  let result;
  try {
    result = await loadAllAudit(filters, {
      onProgress: (count) =>
        showNotice({ kind: 'info', text: `Reading the audit trail... ${count.toLocaleString('en-PH')} entries so far.` }),
    });
  } catch (error) {
    showNotice({ kind: 'danger', text: friendlyError(error) });
    setExportButtonsBusy(false);
    return;
  }

  const { entries, truncated } = result;

  if (entries.length === 0) {
    showNotice({ kind: 'info', text: 'There are no entries matching these filters to export.' });
    setExportButtonsBusy(false);
    return;
  }

  const rows = [EXPORT_HEADER, ...exportRows(entries)];

  if (destination === 'sheets') {
    showNotice({ kind: 'info', text: 'Waiting for Google. A window will ask to let the system create the spreadsheet in your Drive.' });

    try {
      const sheet = await exportToSheets({ title: exportTitle(filters), rows });

      await recordExport({
        destination: 'Google Sheets',
        rowCount: entries.length,
        truncated,
        spreadsheetId: sheet.spreadsheetId,
      });

      showNotice({
        kind: 'sheets-done',
        url: sheet.spreadsheetUrl,
        rowCount: entries.length,
        truncated,
      });
    } catch (error) {
      if (error instanceof SheetsDeclined || error instanceof SheetsNotEnabled) {
        // Not a fault the manager caused. The same rows are on offer as a
        // file instead, which is acceptance test 16.
        showNotice({ kind: 'offer-csv', text: error.message });
      } else {
        showNotice({ kind: 'danger', text: friendlyError(error) });
      }
    }

    setExportButtonsBusy(false);
    return;
  }

  // CSV
  downloadCsv(exportFileName(filters), toCsv(rows));

  try {
    await recordExport({ destination: 'CSV download', rowCount: entries.length, truncated });
  } catch (error) {
    // The file is already on the manager's computer, so a failure to record
    // it is reported rather than treated as a failed export
    showNotice({
      kind: 'danger',
      text: `The file was downloaded, but the export could not be recorded in the audit trail. ${friendlyError(error)}`,
    });
    setExportButtonsBusy(false);
    return;
  }

  showNotice({
    kind: 'success',
    text:
      `${entries.length.toLocaleString('en-PH')} entries downloaded as a CSV file.` +
      (truncated ? ` The export stopped at ${EXPORT_CEILING.toLocaleString('en-PH')}; narrow the dates for the rest.` : ''),
  });
  setExportButtonsBusy(false);
}

// The export is itself recorded, with which slice of the trail it covered,
// so the trail shows who took a copy of it and when
async function recordExport({ destination, rowCount, truncated, spreadsheetId = null }) {
  const described = describeFilters(filters, options);

  await auditedWrite([], {
    action: 'audit.export',
    entity: 'audit_logs',
    entityId: spreadsheetId,
    after: {
      destination,
      rowCount,
      filters: Object.keys(described).length > 0 ? described : { scope: 'all entries' },
      ...(spreadsheetId ? { spreadsheetId } : {}),
      ...(truncated ? { truncated: true } : {}),
    },
    summary:
      `Exported ${rowCount.toLocaleString('en-PH')} audit trail entr${rowCount === 1 ? 'y' : 'ies'} ` +
      `to ${destination}` +
      (Object.keys(described).length > 0 ? ' (filtered)' : ''),
  });
}

// ============================================================
// BEHAVIOUR
// ============================================================

function wire() {
  const form = $('#auFilters', container);
  form?.addEventListener('submit', (event) => event.preventDefault());

  $$('select, input', form).forEach((control) => {
    control.addEventListener('change', () => {
      const field = {
        from: 'dateFrom',
        to: 'dateTo',
        user: 'actorUid',
        action: 'action',
        material: 'materialId',
      }[control.name];

      filters[field] = control.value;
      notice = null;
      syncUrl();
      reload();
    });
  });

  $('#auClear', container)?.addEventListener('click', () => {
    filters = { dateFrom: '', dateTo: '', actorUid: '', action: '', materialId: '' };
    notice = null;
    syncUrl();
    reload();
  });

  $$('[data-entry]', container).forEach((button) => {
    button.addEventListener('click', () => showDetail(button.dataset.entry));
  });

  $('#auNext', container)?.addEventListener('click', () => goToPage(pageIndex + 1));
  $('#auPrev', container)?.addEventListener('click', () => goToPage(pageIndex - 1));

  $('#auExportSheets', container)?.addEventListener('click', () => runExport('sheets'));
  $('#auExportCsv', container)?.addEventListener('click', () => runExport('csv'));
  $('#auOfferCsv', container)?.addEventListener('click', () => runExport('csv'));
}

// The URL is updated without re-running the route, since the page is about
// to reload its own data. setQuery() would redraw everything from scratch
// and lose the page position for no gain.
function syncUrl() {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('from', filters.dateFrom);
  if (filters.dateTo) params.set('to', filters.dateTo);
  if (filters.actorUid) params.set('user', filters.actorUid);
  if (filters.action) params.set('action', filters.action);
  if (filters.materialId) params.set('material', filters.materialId);

  const query = params.toString();
  window.history.replaceState({}, '', `/audit${query ? `?${query}` : ''}`);
}

async function reload() {
  cursors = [];
  pageIndex = 0;

  try {
    page = await loadAuditPage(filters);
  } catch (error) {
    notice = { kind: 'danger', text: friendlyError(error) };
    page = { entries: [], hasMore: false, lastDoc: null };
  }

  draw();
}

async function goToPage(target) {
  if (target < 0) return;

  try {
    if (target > pageIndex) {
      cursors[pageIndex] = page.lastDoc;
      page = await loadAuditPage(filters, page.lastDoc);
    } else {
      // Firestore pages forward only, so going back starts from the cursor
      // that was kept on the way forward
      const cursor = target === 0 ? null : cursors[target - 1];
      page = await loadAuditPage(filters, cursor);
    }
    pageIndex = target;
  } catch (error) {
    notice = { kind: 'danger', text: friendlyError(error) };
  }

  draw();
}
