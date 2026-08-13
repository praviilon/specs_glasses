<?php
require_once __DIR__ . '/../includes/bootstrap.php';
require_method('POST');
check_csrf();

$input = json_input();
$email = strtolower(trim(isset($input['email']) ? $input['email'] : ''));
$password = (string) (isset($input['password']) ? $input['password'] : '');

$user = find_user_by_email($email);
if (!$user) {
    fail('Incorrect email or password.', 401);
}
if (!empty($user['locked_until']) && strtotime($user['locked_until']) > time()) {
    fail('Too many failed attempts. Please try again in a few minutes.', 429);
}
if (!password_verify($password, $user['password_hash'])) {
    register_failed_login($user);
    fail('Incorrect email or password.', 401);
}

reset_login_attempts((int) $user['id']);
login_user((int) $user['id']);

respond([
    'user' => ['email' => $user['email']],
    'csrfToken' => ensure_csrf_token(),
]);
