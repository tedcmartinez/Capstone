// The manager's dashboard
//
// A port of app/views/dashboard/index.php. It answers five questions in the
// order the original set out, which is worth keeping because it is why the
// page reads as a page rather than a pile of widgets:
//
//   What do I have?            the four figures across the top
//   What condition is it in?   the inventory health bar
//   What can I do now?         quick actions
//   What recently changed?     the movement chart and recent activity
//   What needs attention?      low stock
//
// Manager and webmaster only, as DashboardController was.
//
// Everything on this page is worked out from two reads: the catalog and the
// movements of the last thirty days. The PHP version ran eleven separate
// COUNT and SUM queries, which was free against MySQL on the office PC but
// would be eleven billed round trips here.

import {
  esc,
  render,
  pesoShort,
  shortDate,
  stockStatus,
  stockStatusLabel,
  alertHtml,
  friendlyError,
  personName,
} from '../lib/dom.js';
import {
  loadCatalog,
  lowStockOf,
  inventoryValue,
} from '../lib/materials.js';
import {
  loadMovementsInRange,
  loadRecentMovements,
  dailyTotals,
  daysAgoIso,
  movementTypeLabel,
} from '../lib/movements.js';
import { movementChart } from '../ui/chart.js';
import { updateAlerts } from '../ui/shell.js';
import { COMPANY_NAME } from '../lib/config.js';
import { todayIso } from '../lib/dom.js';

// Thirty days, not fourteen. The brief asked for fourteen, but the LAN
// version used thirty with the comment that it is the shop's reporting
// window and wide enough that the chart still shows something during a
// quiet week. Kept deliberately: this was decision 4 of the five agreed
// before any code was written.
const CHART_DAYS = 30;

export async function renderDashboard(container) {
  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Dashboard</h1>
        <p class="cb-page-sub">Loading the inventory overview...</p>
      </div>
    </div>`);

  let catalog;
  let movements;
  let recent;

  try {
    // Three reads, run together rather than one after another
    [catalog, movements, recent] = await Promise.all([
      loadCatalog(),
      loadMovementsInRange(daysAgoIso(CHART_DAYS), todayIso()),
      loadRecentMovements(8),
    ]);
  } catch (error) {
    render(container, `
      <div class="cb-page-head"><div><h1 class="cb-page-title">Dashboard</h1></div></div>
      ${alertHtml('danger', friendlyError(error))}`);
    return;
  }

  const materials = catalog.materials;
  updateAlerts(lowStockOf(materials));

  // The three health states always add up to the catalog total, which is
  // what the PHP model's countLowOnly() existed to guarantee: a material
  // with nothing left is counted as out, not as low as well.
  const counts = {
    total: materials.length,
    healthy: materials.filter((m) => stockStatus(m.stockQuantity, m.minThreshold) === 'healthy').length,
    low: materials.filter((m) => stockStatus(m.stockQuantity, m.minThreshold) === 'low').length,
    out: materials.filter((m) => stockStatus(m.stockQuantity, m.minThreshold) === 'out').length,
  };

  const lowStock = lowStockOf(materials);
  const series = dailyTotals(movements, CHART_DAYS);

  render(container, `
    <div class="cb-page-head">
      <div>
        <h1 class="cb-page-title">Dashboard</h1>
        <p class="cb-page-sub">Inventory overview for ${esc(COMPANY_NAME)}</p>
      </div>
      <div class="d-flex gap-2">
        <a href="/reports" class="cb-btn cb-btn-outline">
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M4 11H2v3h2zm5-4H7v7h2zm5-5v12h-2V2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/></svg>
          Reports
        </a>
        <a href="/materials" class="cb-btn cb-btn-primary">
          <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
          Add Material
        </a>
      </div>
    </div>

    ${kpiCards(counts, inventoryValue(materials))}
    ${healthCard(counts)}
    ${quickActions()}

    <div class="row g-3 mb-4">
      <div class="col-12 col-xl-7">
        <div class="cb-card h-100">
          <div class="cb-card-head">
            <div>
              <h2 class="cb-section-title">Stock Movements</h2>
              <p class="cb-section-sub">Quantity moved over the last ${CHART_DAYS} days</p>
            </div>
            <div class="cb-chart-legend">
              <span class="cb-chart-key is-in"><span></span> Stock In</span>
              <span class="cb-chart-key is-out"><span></span> Stock Out</span>
            </div>
          </div>
          <div class="cb-card-body">
            ${movementChart(series, { days: CHART_DAYS })}
          </div>
        </div>
      </div>

      <div class="col-12 col-xl-5">
        ${lowStockCard(lowStock)}
      </div>
    </div>

    ${recentCard(recent)}
  `);
}

// ============================================================
// THE FOUR FIGURES
// ============================================================

function kpiCards(counts, value) {
  return `
    <div class="row g-3 mb-4">
      <div class="col-6 col-xl-3">
        <div class="cb-kpi">
          <div class="cb-kpi-top">
            <span class="cb-kpi-label">Total Materials</span>
            <span class="cb-kpi-icon">
              <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5 8 5.961 14.154 3.5zM15 4.239l-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923zM7.443.184a1.5 1.5 0 0 1 1.114 0l7.129 2.852A.5.5 0 0 1 16 3.5v8.662a1 1 0 0 1-.629.928l-7.185 2.874a.5.5 0 0 1-.372 0L.63 13.09a1 1 0 0 1-.63-.928V3.5a.5.5 0 0 1 .314-.464z"/></svg>
            </span>
          </div>
          <div class="cb-kpi-value">${counts.total}</div>
          <div class="cb-kpi-foot">items in catalog</div>
        </div>
      </div>

      <div class="col-6 col-xl-3">
        <div class="cb-kpi is-low">
          <div class="cb-kpi-top">
            <span class="cb-kpi-label">Low Stock</span>
            <span class="cb-kpi-icon">
              <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>
            </span>
          </div>
          <div class="cb-kpi-value ${counts.low > 0 ? 'is-warning' : ''}">${counts.low}</div>
          <div class="cb-kpi-foot">${counts.low > 0 ? 'need reordering soon' : 'nothing running low'}</div>
        </div>
      </div>

      <div class="col-6 col-xl-3">
        <div class="cb-kpi is-out">
          <div class="cb-kpi-top">
            <span class="cb-kpi-label">Out of Stock</span>
            <span class="cb-kpi-icon">
              <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/></svg>
            </span>
          </div>
          <div class="cb-kpi-value ${counts.out > 0 ? 'is-critical' : ''}">${counts.out}</div>
          <div class="cb-kpi-foot">${counts.out > 0 ? 'urgent, cannot be used' : 'all materials available'}</div>
        </div>
      </div>

      <div class="col-6 col-xl-3">
        <div class="cb-kpi is-value">
          <div class="cb-kpi-top">
            <span class="cb-kpi-label">Inventory Value</span>
            <span class="cb-kpi-icon">
              <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M4 10.781c.148 1.667 1.513 2.85 3.591 3.003V15h1.043v-1.216c2.27-.179 3.678-1.438 3.678-3.3 0-1.59-.947-2.51-2.956-3.028l-.722-.187V3.467c1.122.11 1.879.714 2.06 1.578h1.634c-.128-1.606-1.483-2.774-3.694-2.87V1H7.591v1.199c-1.939.196-3.35 1.437-3.35 3.156 0 1.443.918 2.465 2.795 2.951l.6.156v4.128c-1.157-.170-1.962-.798-2.144-1.809zm3.591-3.05c-1.104-.31-1.7-.863-1.7-1.671 0-.913.671-1.6 1.7-1.771zm1.043 1.943c1.347.374 1.96.914 1.96 1.831 0 1.045-.788 1.766-2.116 1.879V9.674z"/></svg>
            </span>
          </div>
          <div class="cb-kpi-value is-money">${esc(pesoShort(value))}</div>
          <div class="cb-kpi-foot">total stock on hand</div>
        </div>
      </div>
    </div>`;
}

// ============================================================
// INVENTORY HEALTH
// One bar in three segments, each sized by its share of the catalog, with a
// legend that doubles as links into the filtered catalog.
// ============================================================

function healthCard(counts) {
  // A floor of one keeps a fresh install from dividing by zero
  const total = Math.max(1, counts.total);
  const percent = (count) => Math.round((count / total) * 1000) / 10;

  const healthyPct = percent(counts.healthy);
  const lowPct = percent(counts.low);
  const outPct = percent(counts.out);

  return `
    <div class="cb-card mb-4">
      <div class="cb-card-head">
        <div>
          <h2 class="cb-section-title">Inventory Health</h2>
          <p class="cb-section-sub">Condition of all ${counts.total} materials in the catalog</p>
        </div>
        <a href="/materials" class="cb-link">View catalog &rsaquo;</a>
      </div>
      <div class="cb-card-body">
        <div class="cb-health-bar">
          ${counts.healthy > 0 ? `<div class="cb-health-seg is-healthy" style="width: ${healthyPct}%;" title="Healthy: ${counts.healthy}"></div>` : ''}
          ${counts.low > 0 ? `<div class="cb-health-seg is-low" style="width: ${lowPct}%;" title="Low stock: ${counts.low}"></div>` : ''}
          ${counts.out > 0 ? `<div class="cb-health-seg is-out" style="width: ${outPct}%;" title="Out of stock: ${counts.out}"></div>` : ''}
        </div>

        <div class="cb-health-legend">
          ${healthItem('healthy', 'Healthy / In Stock', counts.healthy, healthyPct, '--cb-green')}
          ${healthItem('low', 'Low Stock', counts.low, lowPct, '--cb-amber')}
          ${healthItem('out', 'Out of Stock', counts.out, outPct, '--cb-red')}
        </div>
      </div>
    </div>`;
}

function healthItem(status, label, count, pct, colorVar) {
  return `
    <a class="cb-health-item text-decoration-none" href="/materials?status=${status}">
      <div class="cb-health-key"><span class="cb-health-swatch is-${status}"></span> ${esc(label)}</div>
      <div class="cb-health-num" style="color: var(${colorVar});">
        ${count}<span class="cb-health-pct">${pct}%</span>
      </div>
    </a>`;
}

// ============================================================
// QUICK ACTIONS
// ============================================================

function quickActions() {
  const actions = [
    {
      href: '/materials',
      label: 'Add Material',
      modifier: '',
      icon: '<path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/>',
    },
    {
      href: '/movements/stockin',
      label: 'Stock In',
      modifier: ' is-in',
      icon: '<path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1M2 14.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/>',
    },
    {
      href: '/movements/stockout',
      label: 'Stock Out',
      modifier: ' is-out',
      icon: '<path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/>',
    },
    {
      href: '/movements',
      label: 'View Movements',
      modifier: '',
      icon: '<path d="M8 4.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .253.434l2.5 1.5a.5.5 0 1 0 .494-.868L8 8.207z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/>',
    },
  ];

  return `
    <h2 class="cb-section-title mb-2">Quick Actions</h2>
    <div class="row g-3 mb-4">
      ${actions
        .map(
          (action) => `
        <div class="col-6 col-lg-3">
          <a class="cb-quick" href="${action.href}">
            <span class="cb-quick-icon${action.modifier}">
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">${action.icon}</svg>
            </span>
            ${esc(action.label)}
          </a>
        </div>`
        )
        .join('')}
    </div>`;
}

// ============================================================
// LOW STOCK
// The six most urgent, since the full list has its own report
// ============================================================

function lowStockCard(lowStock) {
  if (lowStock.length === 0) {
    return `
      <div class="cb-card h-100">
        ${lowStockHead()}
        <div class="cb-card-body is-flush">
          <div class="cb-empty">
            <div class="cb-empty-icon">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>
            </div>
            <div class="cb-empty-title">Everything is stocked</div>
            <p class="cb-empty-text">No materials are below threshold right now.</p>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="cb-card h-100">
      ${lowStockHead()}
      <div class="cb-card-body is-flush">
        <div class="cb-table-wrap">
          <table class="cb-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${lowStock.slice(0, 6).map(lowStockRow).join('')}
            </tbody>
          </table>
        </div>
        ${
          lowStock.length > 6
            ? `<div class="p-3 border-top">
                 <a href="/reports/lowstock" class="cb-link">
                   View all ${lowStock.length} low stock materials &rsaquo;
                 </a>
               </div>`
            : ''
        }
      </div>
    </div>`;
}

function lowStockHead() {
  return `
    <div class="cb-card-head">
      <div>
        <h2 class="cb-section-title">Low Stock Materials</h2>
        <p class="cb-section-sub">At or below the minimum threshold</p>
      </div>
      <a href="/reports/lowstock" class="cb-link">Report &rsaquo;</a>
    </div>`;
}

function lowStockRow(material) {
  const status = stockStatus(material.stockQuantity, material.minThreshold);

  return `
    <tr>
      <td>
        <div class="cb-cell-name">${esc(material.name)}</div>
        <div class="cb-cell-sub">${esc(material.category)}</div>
      </td>
      <td>
        <span class="cb-cell-stock">${Number(material.stockQuantity) || 0}</span>
        <span class="text-muted">/ ${Number(material.minThreshold) || 0}</span>
        <div class="cb-cell-sub">${esc(material.unit)}</div>
      </td>
      <td><span class="cb-badge is-${status}">${esc(stockStatusLabel(status))}</span></td>
    </tr>`;
}

// ============================================================
// RECENT ACTIVITY
// ============================================================

function recentCard(recent) {
  if (recent.length === 0) {
    return `
      <div class="cb-card">
        ${recentHead()}
        <div class="cb-card-body is-flush">
          <div class="cb-empty">
            <div class="cb-empty-icon">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .253.434l2.5 1.5a.5.5 0 1 0 .494-.868L8 8.207z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>
            </div>
            <div class="cb-empty-title">No movements yet</div>
            <p class="cb-empty-text">Stock in and stock out activity will appear here.</p>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="cb-card">
      ${recentHead()}
      <div class="cb-card-body is-flush">
        <div class="cb-table-wrap">
          <table class="cb-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Movement</th>
                <th class="cb-num">Quantity</th>
                <th>Date</th>
                <th>Logged By</th>
              </tr>
            </thead>
            <tbody>
              ${recent.map(recentRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function recentHead() {
  return `
    <div class="cb-card-head">
      <div>
        <h2 class="cb-section-title">Recent Movements</h2>
        <p class="cb-section-sub">Latest stock in, stock out and adjustment activity</p>
      </div>
      <a href="/movements" class="cb-link">View All Movements &rsaquo;</a>
    </div>`;
}

function recentRow(movement) {
  const isIn = movement.type === 'in';
  const isAdjust = movement.type === 'adjust';
  const quantity = Number(movement.quantity) || 0;
  const difference = Number(movement.difference) || 0;

  const sign = isAdjust ? (difference > 0 ? '+' : '-') : isIn ? '+' : '-';
  const badgeClass = isAdjust ? 'is-adjust' : isIn ? 'is-in' : 'is-out';

  return `
    <tr>
      <td class="cb-cell-name">${esc(movement.materialName)}</td>
      <td>
        <span class="cb-move ${badgeClass}">
          ${esc(movementTypeLabel(movement.type))}
          <span class="cb-move-qty">${sign}${quantity}</span>
        </span>
      </td>
      <td class="cb-num">${quantity}</td>
      <td class="text-muted">${esc(shortDate(movement.movementDate))}</td>
      <td>${esc(personName(movement.loggedByName))}</td>
    </tr>`;
}
