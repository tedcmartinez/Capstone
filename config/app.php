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
