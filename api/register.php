<?php
require_once __DIR__ . '/../includes/bootstrap.php';
require_method('POST');
check_csrf();

$input = json_input();
$email = strtolower(trim(isset($input['email']) ? $input['email'] : ''));
$password = (string) (isset($input['password']) ? $input['password'] : '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail('Enter a valid email address.');
}
if (strlen($password) < 8) {
    fail('Password must be at least 8 characters.');
}
if (find_user_by_email($email)) {
    fail('An account with this email already exists.', 409);
}

$userId = create_user($email, $password);
login_user($userId);

respond([
    'user' => ['email' => $email],
    'csrfToken' => ensure_csrf_token(),
]);
