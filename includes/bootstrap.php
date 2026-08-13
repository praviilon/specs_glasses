<?php
/**
 * Loaded first by every entry point (index.php and every file in api/).
 * Starts the session, loads config, and wires up db/auth/helper functions.
 *
 * Config comes from one of two places:
 *  - Environment variables (DB_HOST etc.) — used on hosts like Railway, where you set these
 *    as service variables instead of committing a file. Checked first.
 *  - config.php — used on traditional hosting, where you copy config.php.example to config.php
 *    and fill it in. Used if no DB_HOST environment variable is present.
 */

define('APP_BOOTSTRAPPED', true);

$appRoot = dirname(__DIR__);

$envDbHost = getenv('DB_HOST');
if ($envDbHost !== false && $envDbHost !== '') {
    $config = [
        'db' => [
            'host'    => $envDbHost,
            'port'    => getenv('DB_PORT') ?: '3306',
            'name'    => getenv('DB_NAME') ?: '',
            'user'    => getenv('DB_USER') ?: '',
            'pass'    => getenv('DB_PASS') ?: '',
            'charset' => 'utf8mb4',
        ],
        'max_upload_bytes' => getenv('MAX_UPLOAD_BYTES') ? (int) getenv('MAX_UPLOAD_BYTES') : (8 * 1024 * 1024),
    ];
} else {
    $configFile = $appRoot . '/config.php';
    if (!file_exists($configFile)) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'This app is not configured yet. Either set DB_HOST/DB_NAME/DB_USER/DB_PASS as environment variables, or copy config.php.example to config.php and fill in your database details.',
        ]);
        exit;
    }
    $config = require $configFile;
    if (!isset($config['db']['port'])) {
        $config['db']['port'] = '3306';
    }
}

session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

define('STORAGE_DIR', $appRoot . '/storage/uploads');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/functions.php';
require_once __DIR__ . '/auth.php';
