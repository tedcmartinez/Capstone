// The application shell: sidebar, top bar, and content area
//
// A direct port of app/views/layouts/header.php and footer.php. The markup,
// the class names, the grouping of the navigation, and the SVG icons are the
// same as the LAN version, so the system looks identical to the screenshots
// already in the capstone manuscript.
//
// Links a role may not use are left out rather than disabled, exactly as the
// PHP template did with its $cbIsManager checks. The server rules deny the
// underlying data regardless, so this is presentation only.

import { esc } from '../lib/dom.js';
import { navigate } from '../lib/router.js';
import { signOutUser } from '../lib/auth.js';
import {
  name as userName,
  roleLabel,
  initials,
  isManager,
} from '../lib/session.js';
import { COMPANY_NAME } from '../lib/config.js';
import {
  onSyncChange,
  failureList,
  pendingList,
  dismissFailure,
  dismissAllFailures,
} from '../lib/sync.js';

// ============================================================
// ICONS
// Bootstrap Icons paths, copied from the PHP template so the sidebar is
// pixel for pixel what it was. Kept as data rather than inline markup so
// the navigation below reads as a list of links.
// ============================================================

const icons = {
  dashboard:
    '<path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5zM2.5 2a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5zM9 2.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5zM1 10.5A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5zm6.5.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5z"/>',
  materials:
    '<path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5 8 5.961 14.154 3.5zM15 4.239l-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923zM7.443.184a1.5 1.5 0 0 1 1.114 0l7.129 2.852A.5.5 0 0 1 16 3.5v8.662a1 1 0 0 1-.629.928l-7.185 2.874a.5.5 0 0 1-.372 0L.63 13.09a1 1 0 0 1-.63-.928V3.5a.5.5 0 0 1 .314-.464z"/>',
  categories:
    '<path d="M2 2a1 1 0 0 1 1-1h3.5a1 1 0 0 1 .8.4l.9 1.2a1 1 0 0 0 .8.4H13a1 1 0 0 1 1 1v1H2z"/><path d="M1.5 5h13a.5.5 0 0 1 .5.55l-.8 8A1.5 1.5 0 0 1 12.7 15H3.3a1.5 1.5 0 0 1-1.5-1.45l-.8-8A.5.5 0 0 1 1.5 5"/>',
  suppliers:
    '<path d="M0 3.5A1.5 1.5 0 0 1 1.5 2h9A1.5 1.5 0 0 1 12 3.5V5h1.02a1.5 1.5 0 0 1 1.17.563l1.481 1.85a1.5 1.5 0 0 1 .329.938V10.5a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 1 1-4 0H6a2 2 0 1 1-3.998-.085A1.5 1.5 0 0 1 0 10.5zm1.5-.5a.5.5 0 0 0-.5.5v7.014l.24-.317A1.99 1.99 0 0 1 4 9.5c.622 0 1.18.284 1.546.729l.24-.229H11V3.5a.5.5 0 0 0-.5-.5zM12 6v3.5h3v-.15a.5.5 0 0 0-.11-.312l-1.48-1.85A.5.5 0 0 0 13.02 6zM4 10.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2m8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2"/>',
  stockin:
    '<path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1M2 14.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/>',
  stockout:
    '<path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/>',
  history:
    '<path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.379l.758.653a8 8 0 0 1-.401.432zM8 15a7 7 0 0 0 5-2.09l.707.707A8 8 0 0 1 8 16zM.15 8.008A8 8 0 0 1 8 0v1a7 7 0 0 0-6.85 7z"/><path d="M8 4.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .253.434l2.5 1.5a.5.5 0 1 0 .494-.868L8 8.207z"/>',
  reports:
    '<path d="M4 11H2v3h2zm5-4H7v7h2zm5-5v12h-2V2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/>',
  warning:
    '<path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/>',
  checklist:
    '<path d="M5 11.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m-2-3a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5"/><path d="M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/>',
  users:
    '<path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1zm-7.978-1L7 12.999c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.278.593.69.758 1.457.76 1.72l-.008.002-.014.002zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6.936 9.28a6 6 0 0 0-1.23-.247A7 7 0 0 0 5 9c-4 0-5 3-5 4q0 1 1 1h4.216A2.24 2.24 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816M4.92 10A5.5 5.5 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/>',
  audit:
    '<path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5z"/><path d="M4.5 10.5A.5.5 0 0 1 5 10h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5m0 2A.5.5 0 0 1 5 12h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5m0-4A.5.5 0 0 1 5 8h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5"/>',
  settings:
    '<path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>',
  menu:
    '<path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/>',
  search:
    '<path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.44.27.98.68 3.106 3.106 3.106 3.106l1.514-1.514s-2.07-2.07-3.106-3.106a1 1 0 0 0-.68-.98zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/>',
  bell:
    '<path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2M8 1.918l-.797.161A4 4 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4 4 0 0 0-3.203-3.92zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5 5 0 0 1 13 6c0 .88.32 4.2 1.22 6"/>',
  chevron:
    '<path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"/>',
  logout:
    '<path fill-rule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0z"/><path fill-rule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708z"/>',
};

function icon(key, size = 17) {
  return `<svg width="${size}" height="${size}" fill="currentColor" viewBox="0 0 16 16">${icons[key]}</svg>`;
}

// ============================================================
// NAVIGATION
// ============================================================

// Marks a link active. Ported from navActive() in header.php: a child route
// such as /materials/create also lights up the Materials link.
function activeClass(current, path, extraPrefixes = []) {
  if (current === path) return ' active';
  for (const prefix of extraPrefixes) {
    if (current.startsWith(prefix)) return ' active';
  }
  return '';
}

function navLink(current, { href, label, iconKey, extra = [], badge = null, badgeTitle = '' }) {
  const badgeHtml =
    badge && badge > 0
      ? `<span class="cb-nav-count is-alert"${badgeTitle ? ` title="${esc(badgeTitle)}" aria-label="${esc(badgeTitle)}"` : ''}>${badge}</span>`
      : '';
  return `
    <a class="cb-nav-link${activeClass(current, href, extra)}" href="${href}">
      ${icon(iconKey)}
      ${esc(label)}
      ${badgeHtml}
    </a>`;
}

// The Low Stock Report badge counts low and out-of-stock materials
// together, while the dashboard's Low Stock card counts only the low ones,
// so the badge's tooltip spells out the split: "16 need reordering: 12 low,
// 4 out of stock".
export function reorderBadgeTitle(lowStock) {
  const out = lowStock.filter((m) => (Number(m.stockQuantity) || 0) === 0).length;
  const low = lowStock.length - out;
  return `${lowStock.length} need reordering: ${low} low, ${out} out of stock`;
}

function sidebar(current, lowStock) {
  const manager = isManager();
  const alertCount = lowStock.length;

  return `
    <aside class="cb-sidebar d-print-none" id="cbSidebar">
      <a class="cb-sidebar-brand" href="/">
        <span class="cb-sidebar-mark">C</span>
        <span>
          <span class="cb-sidebar-word">Cornerblock</span>
          <span class="cb-sidebar-tag">Inventory System</span>
        </span>
      </a>

      <nav class="cb-sidebar-nav">
        ${manager ? navLink(current, { href: '/dashboard', label: 'Dashboard', iconKey: 'dashboard' }) : ''}

        <div class="cb-nav-group">Inventory</div>
        ${navLink(current, {
          href: '/materials',
          label: 'Materials',
          iconKey: 'materials',
          extra: ['/materials/'],
        })}
        ${navLink(current, { href: '/categories', label: 'Categories', iconKey: 'categories' })}
        ${manager ? navLink(current, { href: '/suppliers', label: 'Suppliers', iconKey: 'suppliers' }) : ''}

        <div class="cb-nav-group">Transactions</div>
        ${navLink(current, { href: '/movements/stockin', label: 'Stock In', iconKey: 'stockin' })}
        ${navLink(current, { href: '/movements/stockout', label: 'Stock Out', iconKey: 'stockout' })}
        ${navLink(current, { href: '/movements', label: 'Movement History', iconKey: 'history' })}

        ${
          manager
            ? `
        <div class="cb-nav-group">Reports</div>
        ${navLink(current, { href: '/reports', label: 'Inventory Report', iconKey: 'reports' })}
        ${navLink(current, {
          href: '/reports/lowstock',
          label: 'Low Stock Report',
          iconKey: 'warning',
          badge: alertCount,
          badgeTitle: reorderBadgeTitle(lowStock),
        })}
        ${navLink(current, { href: '/checklist', label: 'Reorder Checklist', iconKey: 'checklist' })}

        <div class="cb-nav-group">Admin</div>
        ${navLink(current, { href: '/users', label: 'Users', iconKey: 'users', extra: ['/users/'] })}
        ${navLink(current, { href: '/audit', label: 'Audit Trail', iconKey: 'audit' })}
        ${navLink(current, { href: '/settings', label: 'Settings', iconKey: 'settings' })}`
            : ''
        }
      </nav>

      <div class="cb-sidebar-foot">${esc(COMPANY_NAME)}</div>
    </aside>

    <div class="cb-backdrop" id="cbBackdrop"></div>`;
}

// ============================================================
// TOP BAR
//
// The alert bell lists what currently needs attention. In the PHP version
// header.php ran its own low-stock query on every page; here the caller
// passes the list in, because the materials page has already loaded it and
// Firestore reads are a billed resource worth not repeating.
// ============================================================

function notificationBell(lowStock) {
  const count = lowStock.length;
  const badge = count > 0 ? `<span class="cb-icon-badge">${count > 9 ? '9+' : count}</span>` : '';

  const items =
    count === 0
      ? `<div class="cb-empty" style="padding:24px 12px;">
           <p class="cb-empty-text">All materials are above their threshold.</p>
         </div>`
      : lowStock
          .slice(0, 6)
          .map((item) => {
            const isOut = Number(item.stockQuantity) === 0;
            return `
            <a class="cb-notif-item" href="/materials?status=${isOut ? 'out' : 'low'}">
              <span class="cb-notif-dot" style="background-color: var(${isOut ? '--cb-red' : '--cb-amber'});"></span>
              <span>
                <span class="cb-notif-title">${esc(item.name)}</span>
                <span class="cb-notif-meta">
                  ${isOut ? 'Out of stock' : 'Low stock'} &middot;
                  ${Number(item.stockQuantity)} / ${Number(item.minThreshold)} ${esc(item.unit || '')}
                </span>
              </span>
            </a>`;
          })
          .join('') +
        (isManager()
          ? `<div class="dropdown-divider"></div>
             <a class="dropdown-item" href="/reports/lowstock">View low stock report</a>`
          : '');

  return `
    <div class="dropdown">
      <button class="cb-icon-btn" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-label="Alerts">
        ${icon('bell', 18)}
        ${badge}
      </button>
      <div class="dropdown-menu dropdown-menu-end cb-dropdown cb-notif">
        <div class="dropdown-header">Needs Attention</div>
        ${items}
      </div>
    </div>`;
}

// The right hand side of the top bar, kept as its own function so the bell
// can be redrawn on its own once a page has loaded the low-stock list.
function topbarRight(lowStock) {
  return `
      <div class="cb-topbar-right">
        ${notificationBell(lowStock)}

        <div class="dropdown">
          <button class="cb-user-btn" type="button" data-bs-toggle="dropdown">
            <span class="cb-avatar">${esc(initials())}</span>
            <span class="cb-user-text">
              <span class="cb-user-name">${esc(userName())}</span>
              <span class="cb-user-role">${esc(roleLabel())}</span>
            </span>
            ${icon('chevron', 11)}
          </button>
          <div class="dropdown-menu dropdown-menu-end cb-dropdown">
            <div class="dropdown-header">${esc(userName())}</div>
            ${
              isManager()
                ? `<a class="dropdown-item" href="/settings">${icon('settings', 14)} Settings</a>`
                : ''
            }
            <div class="dropdown-divider"></div>
            <button class="dropdown-item is-danger" type="button" id="cbLogout">
              ${icon('logout', 14)} Log Out
            </button>
          </div>
        </div>
      </div>`;
}

function topbar(lowStock) {
  return `
    <header class="cb-topbar d-print-none">
      <button class="cb-menu-btn" id="cbMenuBtn" type="button" aria-label="Open menu">
        ${icon('menu', 18)}
      </button>

      <form class="cb-topbar-search" id="cbTopSearch" role="search">
        ${icon('search', 15)}
        <input type="search" name="q" placeholder="Search materials..." aria-label="Search materials">
      </form>

      ${topbarRight(lowStock)}
    </header>`;
}

// ============================================================
// THE SYNC BANNER
//
// A write that was reported as saved and then refused by the server must not
// disappear quietly. This strip sits directly under the top bar on every
// page, so the person who entered the movement sees it wherever they have
// navigated to since.
//
// It is deliberately not dismissable in one click when a failure is listed:
// the entry has to be made again, and the notice says so by name, because
// "something failed" is no use to somebody holding a delivery receipt.
// ============================================================

function syncBannerHtml({ pending, failures }) {
  if (failures.length === 0 && pending.length === 0) return '';

  if (failures.length > 0) {
    const count = failures.length;

    return `
      <div class="cb-sync-banner is-failed" role="alert">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16" style="flex-shrink:0;">
          ${icons.warning}
        </svg>
        <div class="cb-sync-text">
          <strong>
            ${count} ${count === 1 ? 'entry' : 'entries'} failed to sync and
            ${count === 1 ? 'was' : 'were'} not saved. Please enter
            ${count === 1 ? 'it' : 'them'} again.
          </strong>
          <ul class="cb-sync-list">
            ${failures
              .map(
                (failure) => `
              <li>
                <span class="cb-sync-what">${esc(failure.description)}</span>
                <span class="cb-sync-why">${esc(failure.reason)}</span>
              </li>`
              )
              .join('')}
          </ul>
        </div>
        <button type="button" class="cb-btn cb-btn-outline cb-btn-sm" id="cbSyncDismiss">
          I have re-entered ${count === 1 ? 'it' : 'them'}
        </button>
      </div>`;
  }

  const count = pending.length;
  return `
    <div class="cb-sync-banner is-pending" role="status">
      <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16" style="flex-shrink:0;">
        <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/>
        <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/>
      </svg>
      <div class="cb-sync-text">
        ${count} ${count === 1 ? 'entry is' : 'entries are'} saved on this
        computer and waiting to reach the server.
      </div>
    </div>`;
}

// Redraws the banner in place. Called on every change the tracker reports,
// so it appears the moment a queued write is refused, even if the user has
// moved to another page since.
function renderSyncBanner() {
  const target = document.getElementById('cbSyncBanner');
  if (!target) return;

  target.innerHTML = syncBannerHtml({ pending: pendingList(), failures: failureList() });

  document.getElementById('cbSyncDismiss')?.addEventListener('click', () => {
    dismissAllFailures();
  });
}

// Subscribed once, for the life of the page, rather than per render, so the
// notice survives navigation between pages.
let syncSubscribed = false;

function subscribeToSync() {
  if (syncSubscribed) return;
  syncSubscribed = true;
  onSyncChange(() => renderSyncBanner());
}

// ============================================================
// MOUNTING
// ============================================================

// Draws the shell once and returns the content element for a page to fill.
// Re-rendering the whole shell on every navigation would close any open
// dropdown and lose the search box's focus, so if the shell is already on
// screen only the active link and the bell are refreshed.
let mounted = false;

export function mountShell({ lowStock = [] } = {}) {
  const root = document.getElementById('app');
  const current = window.location.pathname.replace(/\/+$/, '') || '/';

  if (!mounted || !document.getElementById('cbSidebar')) {
    root.innerHTML = `
      <div class="cb-layout">
        ${sidebar(current, lowStock)}
        <div class="cb-main">
          ${topbar(lowStock)}
          <div id="cbSyncBanner"></div>
          <div class="cb-content" id="cbContent"></div>
        </div>
      </div>`;
    mounted = true;
    wireShell();
    renderSyncBanner();
  } else {
    refreshActiveLink(current);
    renderSyncBanner();
  }

  subscribeToSync();

  return document.getElementById('cbContent');
}

// Called when the shell needs rebuilding, for example after signing out so
// the next user does not briefly see the previous one's navigation.
export function resetShell() {
  mounted = false;
}

// Updates the bell and the sidebar badge once a page has loaded its data.
// Only these two parts are redrawn, so the page content and any open form
// below are left untouched.
export function updateAlerts(lowStock) {
  const sidebarEl = document.getElementById('cbSidebar');
  const rightEl = document.querySelector('.cb-topbar-right');
  if (!sidebarEl || !rightEl) return;

  const current = window.location.pathname.replace(/\/+$/, '') || '/';

  // The backdrop sits immediately after the sidebar and is replaced with it,
  // so it is removed first to avoid leaving a duplicate behind.
  document.getElementById('cbBackdrop')?.remove();
  sidebarEl.outerHTML = sidebar(current, lowStock);
  rightEl.outerHTML = topbarRight(lowStock);

  wireShell();
}

function refreshActiveLink(current) {
  document.querySelectorAll('.cb-nav-link').forEach((link) => {
    const href = link.getAttribute('href');
    const extra = href === '/materials' ? ['/materials/'] : href === '/users' ? ['/users/'] : [];
    link.classList.toggle('active', activeClass(current, href, extra) === ' active');
  });
}

// ============================================================
// BEHAVIOUR
// Ported from public/js/app.js: the sidebar slide-in and the Escape key.
// The quantity steppers and auto-submitting filters belong to individual
// pages and are wired by those pages instead.
// ============================================================

function wireShell() {
  const sidebarEl = document.getElementById('cbSidebar');
  const menuBtn = document.getElementById('cbMenuBtn');
  const backdrop = document.getElementById('cbBackdrop');

  if (sidebarEl && menuBtn && backdrop) {
    const close = () => {
      sidebarEl.classList.remove('is-open');
      backdrop.classList.remove('show');
    };
    menuBtn.addEventListener('click', () => {
      sidebarEl.classList.add('is-open');
      backdrop.classList.add('show');
    });
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  }

  // The search box sends the keyword to the materials catalog, the same as
  // the PHP form that submitted a GET to /materials.
  const search = document.getElementById('cbTopSearch');
  if (search) {
    search.addEventListener('submit', (event) => {
      event.preventDefault();
      const keyword = search.querySelector('input').value.trim();
      navigate(keyword ? `/materials?q=${encodeURIComponent(keyword)}` : '/materials');
    });
  }

  const logout = document.getElementById('cbLogout');
  if (logout) {
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      resetShell();
      await signOutUser();
    });
  }
}
