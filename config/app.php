<?php
// General application configuration
// Defines the base URL, app name, and starts the session used for authentication

// Base URL of the application as served by XAMPP's Apache.
// We build it from the host the visitor actually typed so the same code
// works both on the server PC (localhost) and from other PCs on the office
// LAN (which use the server's IP address, e.g. 192.168.1.50). Only the
// folder path is fixed; change it here if the project folder is renamed.
$appHost = $_SERVER['HTTP_HOST'] ?? 'localhost';
$appScheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
define('BASE_URL', $appScheme . '://' . $appHost . '/cornerblock/public/');
define('APP_NAME', 'Cornerblock Materials Inventory System');

// Start the session on every request so Auth::check() and friends work
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// ============================================================
// Small display helpers used by the views
// ============================================================

// Formats an amount as Philippine pesos, e.g. 12500 becomes "PHP 12,500.00".
// Returns a dash when no cost has been recorded for a material.
function peso($amount, string $emptyText = '-'): string
{
    if ($amount === null || $amount === '') {
        return $emptyText;
    }
    return 'PHP ' . number_format((float) $amount, 2);
}

// Shortened peso format for the dashboard tile, where a long figure would
// not fit, e.g. 1250000 becomes "PHP 1.25M".
function pesoShort($amount): string
{
    $value = (float) $amount;
    if ($value >= 1000000) {
        return 'PHP ' . number_format($value / 1000000, 2) . 'M';
    }
    if ($value >= 100000) {
        return 'PHP ' . number_format($value / 1000, 1) . 'K';
    }
    return 'PHP ' . number_format($value, 2);
}

// Works out a material's stock status from its quantity and threshold.
// Returns 'out', 'low', or 'healthy'. Every status badge in the system
// goes through here so the rules stay identical on every page.
function stockStatus($quantity, $threshold): string
{
    $quantity = (int) $quantity;
    $threshold = (int) $threshold;

    if ($quantity === 0) {
        return 'out';
    }
    if ($quantity <= $threshold) {
        return 'low';
    }
    return 'healthy';
}

// The wording shown inside a status badge
function stockStatusLabel(string $status): string
{
    $labels = [
        'out' => 'Out of Stock',
        'low' => 'Low Stock',
        'healthy' => 'Healthy',
    ];
    return $labels[$status] ?? $status;
}

// Formats a stored date as a short readable one, e.g. "Aug 21, 2026"
function shortDate(?string $date): string
{
    if (empty($date)) {
        return '-';
    }
    $timestamp = strtotime($date);
    return $timestamp ? date('M j, Y', $timestamp) : $date;
}
