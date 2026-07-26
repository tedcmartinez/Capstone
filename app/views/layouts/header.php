<?php
// Shared page layout: HTML head, top bar, and hover-expanding left sidebar.
// Top bar: Cornerblock logo (always visible) and the user greeting menu.
// Sidebar: role-based navigation links, with Settings pinned at the bottom.

// Marks the current page's sidebar link as active by comparing the
// requested path against the link's route
function navActive(string $route): string
{
    $path = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '', '/');
    $base = rtrim(parse_url(BASE_URL, PHP_URL_PATH) ?? '', '/');
    $current = trim(substr($path, strlen($base)), '/');
    return $current === $route ? ' active' : '';
}
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
<div class="cb-layout d-flex">

    <?php if (Auth::check()): ?>
    <!-- Left sidebar: slim rail that expands on hover. Navigation on top,
         Settings pinned to the bottom. -->
    <aside class="cb-sidebar d-print-none">
        <nav class="nav flex-column cb-sidebar-nav">
            <?php if (Auth::role() === 'general_manager'): ?>
            <a class="nav-link<?= navActive('dashboard') ?>" href="<?= BASE_URL ?>dashboard">Dashboard</a>
            <?php endif; ?>
            <a class="nav-link<?= navActive('materials') ?>" href="<?= BASE_URL ?>materials">Materials</a>
            <a class="nav-link<?= navActive('movements') ?>" href="<?= BASE_URL ?>movements">Movement History</a>
            <a class="nav-link<?= navActive('movements/stockin') ?>" href="<?= BASE_URL ?>movements/stockin">Stock In</a>
            <a class="nav-link<?= navActive('movements/stockout') ?>" href="<?= BASE_URL ?>movements/stockout">Stock Out</a>
            <?php if (Auth::role() === 'general_manager'): ?>
            <a class="nav-link<?= navActive('checklist') ?>" href="<?= BASE_URL ?>checklist">Reorder Checklist</a>
            <?php endif; ?>
        </nav>

        <?php if (Auth::role() === 'general_manager'): ?>
        <!-- Settings: pinned to the sidebar bottom, general manager only -->
        <a class="nav-link cb-sidebar-settings<?= navActive('users') ?>" href="<?= BASE_URL ?>users">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16" class="me-2">
                <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
            </svg>Settings
        </a>
        <?php endif; ?>
    </aside>
    <?php endif; ?>

    <!-- Main column: top bar + page content -->
    <div class="cb-main flex-grow-1">
        <?php if (Auth::check()): ?>
        <header class="cb-topbar d-flex justify-content-between align-items-center d-print-none">
            <!-- Brand wordmark: always visible, top left -->
            <a class="cb-logo" href="<?= BASE_URL ?>">Cornerblock</a>

            <!-- Greeting: hovering reveals the Logout option (pure CSS) -->
            <div class="cb-user-menu">
                <span class="cb-greeting">Hi, <?= htmlspecialchars(Auth::name() ?? '') ?> &#9662;</span>
                <div class="cb-user-dropdown">
                    <a href="<?= BASE_URL ?>logout">Logout</a>
                </div>
            </div>
        </header>
        <?php endif; ?>

        <div class="container-fluid cb-content pb-5">
