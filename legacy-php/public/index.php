<?php
// Single entry point for the application
// Every request from the browser is routed through this file via .htaccess

// Absolute path to the project root (one level above the public folder)
define('ROOT_PATH', dirname(__DIR__));

// Composer autoloader, needed for the PHPMailer library
require ROOT_PATH . '/vendor/autoload.php';

// Application and database configuration
require ROOT_PATH . '/config/app.php';
require ROOT_PATH . '/config/database.php';

// Core framework classes
require ROOT_PATH . '/core/Model.php';
require ROOT_PATH . '/core/Controller.php';
require ROOT_PATH . '/core/Auth.php';
require ROOT_PATH . '/core/Mailer.php';
require ROOT_PATH . '/core/Router.php';

// Dispatch the incoming request to the right controller and action
$router = new Router();
$router->dispatch();
