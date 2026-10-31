<?php
// Shared page layout: HTML head, fixed left sidebar, and top bar.
// Sidebar: grouped navigation (Inventory / Transactions / Reports / Admin),
// with links hidden for roles that are not allowed to use them.
// Top bar: material search, alert bell, and the logged-in user menu.

// The route the browser is currently on, e.g. "materials" or "movements/stockin"
function cbCurrentRoute(): string
{
    $path = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '', '/');
    $base = rtrim(parse_url(BASE_URL, PHP_URL_PATH) ?? '', '/');
    return trim(substr($path, strlen($base)), '/');
}

// Marks a sidebar link as active. $extra lists other routes that belong to
// the same link, for example materials/create also lights up "Materials".
function navActive(string $route, array $extra = []): string
{
    $current = cbCurrentRoute();
    if ($current === $route) {
        return ' active';
    }
    foreach ($extra as $prefix) {
        if (strpos($current, $prefix) === 0) {
            return ' active';
        }
    }
    return '';
}

// Live counts used by the sidebar badge and the alert bell. Loaded here so
// every page shows the same up-to-date numbers without each controller
// having to pass them in.
$cbLowStock = [];
if (Auth::check()) {
    require_once ROOT_PATH . '/app/models/Material.php';
    $cbNavMaterial = new Material();
    $cbLowStock = $cbNavMaterial->getLowStock();
}
$cbAlertCount = count($cbLowStock);

// Initials shown in the round avatar, e.g. "Ted Martinez" becomes "TM"
$cbInitials = '';
foreach (explode(' ', trim(Auth::name() ?? '')) as $cbPart) {
    if ($cbPart !== '') {
        $cbInitials .= strtoupper($cbPart[0]);
    }
}
$cbInitials = substr($cbInitials, 0, 2);
$cbRoleLabel = Auth::role() === 'general_manager' ? 'General Manager' : 'Production Staff';
$cbIsManager = Auth::role() === 'general_manager';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= APP_NAME ?></title>
    <link rel="stylesheet" href="<?= BASE_URL ?>css/bootstrap.min.css">
    <!-- The ?v= timestamp changes whenever style.css is edited, which
         forces browsers to fetch the latest version instead of a cached copy -->
    <link rel="stylesheet" href="<?= BASE_URL ?>css/style.css?v=<?= filemtime(ROOT_PATH . '/public/css/style.css') ?>">
</head>
<body>
<div class="cb-layout">

    <?php if (Auth::check()): ?>
    <!-- ============ SIDEBAR ============ -->
    <aside class="cb-sidebar d-print-none" id="cbSidebar">
        <a class="cb-sidebar-brand" href="<?= BASE_URL ?>">
            <span class="cb-sidebar-mark">C</span>
            <span>
                <span class="cb-sidebar-word">Cornerblock</span>
                <span class="cb-sidebar-tag">Inventory System</span>
            </span>
        </a>

        <nav class="cb-sidebar-nav">
            <?php if ($cbIsManager): ?>
            <a class="cb-nav-link<?= navActive('dashboard') ?>" href="<?= BASE_URL ?>dashboard">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5zM2.5 2a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5zM9 2.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5zM1 10.5A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5zm6.5.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5z"/></svg>
                Dashboard
            </a>
            <?php endif; ?>

            <div class="cb-nav-group">Inventory</div>
            <a class="cb-nav-link<?= navActive('materials', ['materials/']) ?>" href="<?= BASE_URL ?>materials">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5 8 5.961 14.154 3.5zM15 4.239l-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923zM7.443.184a1.5 1.5 0 0 1 1.114 0l7.129 2.852A.5.5 0 0 1 16 3.5v8.662a1 1 0 0 1-.629.928l-7.185 2.874a.5.5 0 0 1-.372 0L.63 13.09a1 1 0 0 1-.63-.928V3.5a.5.5 0 0 1 .314-.464z"/></svg>
                Materials
            </a>
            <a class="cb-nav-link<?= navActive('categories') ?>" href="<?= BASE_URL ?>categories">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M2 2a1 1 0 0 1 1-1h3.5a1 1 0 0 1 .8.4l.9 1.2a1 1 0 0 0 .8.4H13a1 1 0 0 1 1 1v1H2z"/><path d="M1.5 5h13a.5.5 0 0 1 .5.55l-.8 8A1.5 1.5 0 0 1 12.7 15H3.3a1.5 1.5 0 0 1-1.5-1.45l-.8-8A.5.5 0 0 1 1.5 5"/></svg>
                Categories
            </a>
            <?php if ($cbIsManager): ?>
            <a class="cb-nav-link<?= navActive('suppliers') ?>" href="<?= BASE_URL ?>suppliers">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M0 3.5A1.5 1.5 0 0 1 1.5 2h9A1.5 1.5 0 0 1 12 3.5V5h1.02a1.5 1.5 0 0 1 1.17.563l1.481 1.85a1.5 1.5 0 0 1 .329.938V10.5a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 1 1-4 0H6a2 2 0 1 1-3.998-.085A1.5 1.5 0 0 1 0 10.5zm1.5-.5a.5.5 0 0 0-.5.5v7.014l.24-.317A1.99 1.99 0 0 1 4 9.5c.622 0 1.18.284 1.546.729l.24-.229H11V3.5a.5.5 0 0 0-.5-.5zM12 6v3.5h3v-.15a.5.5 0 0 0-.11-.312l-1.48-1.85A.5.5 0 0 0 13.02 6zM4 10.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2m8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2"/></svg>
                Suppliers
            </a>
            <?php endif; ?>

            <div class="cb-nav-group">Transactions</div>
            <a class="cb-nav-link<?= navActive('movements/stockin') ?>" href="<?= BASE_URL ?>movements/stockin">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1M2 14.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
                Stock In
            </a>
            <a class="cb-nav-link<?= navActive('movements/stockout') ?>" href="<?= BASE_URL ?>movements/stockout">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
                Stock Out
            </a>
            <a class="cb-nav-link<?= navActive('movements') ?>" href="<?= BASE_URL ?>movements">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.379l.758.653a8 8 0 0 1-.401.432zM8 15a7 7 0 0 0 5-2.09l.707.707A8 8 0 0 1 8 16zM.15 8.008A8 8 0 0 1 8 0v1a7 7 0 0 0-6.85 7z"/><path d="M8 4.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .253.434l2.5 1.5a.5.5 0 1 0 .494-.868L8 8.207z"/></svg>
                Movement History
            </a>

            <?php if ($cbIsManager): ?>
            <div class="cb-nav-group">Reports</div>
            <a class="cb-nav-link<?= navActive('reports') ?>" href="<?= BASE_URL ?>reports">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M4 11H2v3h2zm5-4H7v7h2zm5-5v12h-2V2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/></svg>
                Inventory Report
            </a>
            <a class="cb-nav-link<?= navActive('reports/lowstock') ?>" href="<?= BASE_URL ?>reports/lowstock">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>
                Low Stock Report
                <?php if ($cbAlertCount > 0): ?>
                <span class="cb-nav-count is-alert"><?= $cbAlertCount ?></span>
                <?php endif; ?>
            </a>
            <a class="cb-nav-link<?= navActive('checklist') ?>" href="<?= BASE_URL ?>checklist">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M5 11.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m-2-3a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5"/><path d="M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></svg>
                Reorder Checklist
            </a>

            <div class="cb-nav-group">Admin</div>
            <a class="cb-nav-link<?= navActive('users', ['users/']) ?>" href="<?= BASE_URL ?>users">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1zm-7.978-1L7 12.999c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.278.593.69.758 1.457.76 1.72l-.008.002-.014.002zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6.936 9.28a6 6 0 0 0-1.23-.247A7 7 0 0 0 5 9c-4 0-5 3-5 4q0 1 1 1h4.216A2.24 2.24 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816M4.92 10A5.5 5.5 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/></svg>
                Users
            </a>
            <a class="cb-nav-link<?= navActive('settings') ?>" href="<?= BASE_URL ?>settings">
                <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/></svg>
                Settings
            </a>
            <?php endif; ?>
        </nav>

        <div class="cb-sidebar-foot">
            Cornerblock Trading Inc.
        </div>
    </aside>

    <!-- Dark overlay behind the sidebar when it is open on a phone -->
    <div class="cb-backdrop" id="cbBackdrop"></div>
    <?php endif; ?>

    <!-- ============ MAIN COLUMN ============ -->
    <div class="cb-main">
        <?php if (Auth::check()): ?>
        <header class="cb-topbar d-print-none">
            <!-- Opens the sidebar on tablet and phone screens -->
            <button class="cb-menu-btn" id="cbMenuBtn" type="button" aria-label="Open menu">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/></svg>
            </button>

            <!-- Global search: submits to the materials catalog -->
            <form class="cb-topbar-search" method="GET" action="<?= BASE_URL ?>materials" role="search">
                <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.44.27.98.68 3.106 3.106 3.106 3.106l1.514-1.514s-2.07-2.07-3.106-3.106a1 1 0 0 0-.68-.98zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/></svg>
                <input type="search" name="q" placeholder="Search materials..." aria-label="Search materials">
            </form>

            <div class="cb-topbar-right">
                <!-- Alert bell: lists materials that currently need attention -->
                <div class="dropdown">
                    <button class="cb-icon-btn" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-label="Alerts">
                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2M8 1.918l-.797.161A4 4 0 0 0 4 6c0 .628-.134 2.197-.459 3.742-.16.767-.376 1.566-.663 2.258h10.244c-.287-.692-.502-1.49-.663-2.258C12.134 8.197 12 6.628 12 6a4 4 0 0 0-3.203-3.92zM14.22 12c.223.447.481.801.78 1H1c.299-.199.557-.553.78-1C2.68 10.2 3 6.88 3 6c0-2.42 1.72-4.44 4.005-4.901a1 1 0 1 1 1.99 0A5 5 0 0 1 13 6c0 .88.32 4.2 1.22 6"/></svg>
                        <?php if ($cbAlertCount > 0): ?>
                        <span class="cb-icon-badge"><?= $cbAlertCount > 9 ? '9+' : $cbAlertCount ?></span>
                        <?php endif; ?>
                    </button>
                    <div class="dropdown-menu dropdown-menu-end cb-dropdown cb-notif">
                        <div class="dropdown-header">Needs Attention</div>
                        <?php if (empty($cbLowStock)): ?>
                        <div class="cb-empty" style="padding:24px 12px;">
                            <p class="cb-empty-text">All materials are above their threshold.</p>
                        </div>
                        <?php else: ?>
                        <?php foreach (array_slice($cbLowStock, 0, 6) as $cbItem): ?>
                        <?php $cbIsOut = (int) $cbItem['stock_quantity'] === 0; ?>
                        <a class="cb-notif-item" href="<?= BASE_URL ?>materials?status=<?= $cbIsOut ? 'out' : 'low' ?>">
                            <span class="cb-notif-dot" style="background-color: <?= $cbIsOut ? 'var(--cb-red)' : 'var(--cb-amber)' ?>;"></span>
                            <span>
                                <span class="cb-notif-title"><?= htmlspecialchars($cbItem['name']) ?></span>
                                <span class="cb-notif-meta">
                                    <?= $cbIsOut ? 'Out of stock' : 'Low stock' ?> &middot;
                                    <?= (int) $cbItem['stock_quantity'] ?> / <?= (int) $cbItem['min_threshold'] ?> <?= htmlspecialchars($cbItem['unit']) ?>
                                </span>
                            </span>
                        </a>
                        <?php endforeach; ?>
                        <?php if ($cbIsManager): ?>
                        <div class="dropdown-divider"></div>
                        <a class="dropdown-item" href="<?= BASE_URL ?>reports/lowstock">View low stock report</a>
                        <?php endif; ?>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- User menu -->
                <div class="dropdown">
                    <button class="cb-user-btn" type="button" data-bs-toggle="dropdown">
                        <span class="cb-avatar"><?= htmlspecialchars($cbInitials) ?></span>
                        <span class="cb-user-text">
                            <span class="cb-user-name"><?= htmlspecialchars(Auth::name() ?? '') ?></span>
                            <span class="cb-user-role"><?= $cbRoleLabel ?></span>
                        </span>
                        <svg width="11" height="11" fill="currentColor" viewBox="0 0 16 16" class="cb-user-text"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"/></svg>
                    </button>
                    <div class="dropdown-menu dropdown-menu-end cb-dropdown">
                        <div class="dropdown-header"><?= htmlspecialchars(Auth::name() ?? '') ?></div>
                        <?php if ($cbIsManager): ?>
                        <a class="dropdown-item" href="<?= BASE_URL ?>settings">
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/></svg>
                            Settings
                        </a>
                        <?php endif; ?>
                        <div class="dropdown-divider"></div>
                        <a class="dropdown-item is-danger" href="<?= BASE_URL ?>logout">
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0z"/><path fill-rule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708z"/></svg>
                            Log Out
                        </a>
                    </div>
                </div>
            </div>
        </header>
        <?php endif; ?>

        <div class="cb-content">
