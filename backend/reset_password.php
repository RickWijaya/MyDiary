<?php
// backend/reset_password.php
require_once 'utils.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Read JSON body: { "email": "user@example.com", "code": "123456", "newPassword": "..." }
$input = json_decode(file_get_contents("php://input"), true);

$email = trim($input['email'] ?? '');
$code = trim($input['code'] ?? '');
$newPassword = trim($input['newPassword'] ?? '');

if ($email === '' || $code === '' || $newPassword === '') {
    echo json_encode([
        "success" => false,
        "message" => "All fields are required."
    ]);
    exit;
}

if (strlen($newPassword) < 3) {
    echo json_encode([
        "success" => false,
        "message" => "Password must be at least 3 characters."
    ]);
    exit;
}

$data = read_data();
$index = get_user_index($data, $email);

if ($index === -1) {
    echo json_encode([
        "success" => false,
        "message" => "Email is not registered."
    ]);
    exit;
}

// Check reset code
$user = $data['users'][$index];
if (!isset($user['reset_code']) || $user['reset_code'] !== $code) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid reset code."
    ]);
    exit;
}

// Update password and clear reset code
$data['users'][$index]['password'] = $newPassword;
unset($data['users'][$index]['reset_code']);
write_data($data);

echo json_encode([
    "success" => true,
    "message" => "Password has been reset successfully."
]);
exit;
?>
