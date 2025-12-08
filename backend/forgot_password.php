<?php
// backend/forgot_password.php
require_once 'utils.php';
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// Read JSON body: { "email": "user@example.com" }
$input = json_decode(file_get_contents("php://input"), true);
$email = trim($input['email'] ?? '');

if ($email === '') {
    echo json_encode([
        "success" => false,
        "message" => "Email cannot be empty."
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

// 🔹 Generate numeric reset code, e.g. 482913
$code = strval(rand(100000, 999999)); // 6-digit numeric code

// Store it for that user
$data['users'][$index]['reset_code'] = $code;
write_data($data);

// Return success and the code (frontend will show via alert)
echo json_encode([
    "success" => true,
    "code" => $code
]);
exit;