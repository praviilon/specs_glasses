<?php
defined('APP_BOOTSTRAPPED') or die;

/**
 * Returns a shared PDO connection, created on first use.
 */
function db() {
    static $pdo = null;
    if ($pdo === null) {
        global $config;
        $c = $config['db'];
        $dsn = "mysql:host={$c['host']};port=" . (isset($c['port']) ? $c['port'] : '3306') . ";dbname={$c['name']};charset={$c['charset']}";
        try {
            $pdo = new PDO($dsn, $c['user'], $c['pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Could not connect to the database. Check your DB_HOST/DB_NAME/DB_USER/DB_PASS environment variables, or config.php.']);
            exit;
        }
    }
    return $pdo;
}
