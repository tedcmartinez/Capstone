<?php
// Database configuration and connection helper
// Connects to the local MySQL/MariaDB server started by XAMPP

class Database
{
    private static ?PDO $instance = null;

    // Default XAMPP MySQL/MariaDB settings: root user, no password
    private const HOST = 'localhost';
    private const PORT = '3306';
    private const DB_NAME = 'cornerblock_db';
    private const USER = 'root';
    private const PASS = '';
    private const CHARSET = 'utf8mb4';

    // Returns a single shared PDO connection (created once per request)
    public static function connect(): PDO
    {
        if (self::$instance === null) {
            $dsn = 'mysql:host=' . self::HOST . ';port=' . self::PORT . ';dbname=' . self::DB_NAME . ';charset=' . self::CHARSET;
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            self::$instance = new PDO($dsn, self::USER, self::PASS, $options);
        }
        return self::$instance;
    }
}
