<?php
// backend/get_user_data.php
require_once 'utils.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Not logged in
if (!isset($_SESSION['email'])) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Not authenticated'
    ]);
    exit;
}

$email = $_SESSION['email'];
$data  = read_data(); // reads data.json

$index = get_user_index($data, $email);
if ($index === -1) {
    echo json_encode([
        'success' => false,
        'message' => 'User not found'
    ]);
    exit;
}

$user = $data['users'][$index];

// Ensure entries is always an array
$entries = [];
if (isset($user['entries']) && is_array($user['entries'])) {
    $entries = $user['entries'];
}

// Helpers should now work with new format:
// each entry: ['date','diary','face','voice','final']
$streak = calculate_streak($entries);
$recap  = generate_recap($entries);

echo json_encode([
    'success' => true,
    'email'   => $user['email'],
    'entries' => $entries,
    'streak'  => $streak,
    'recap'   => $recap
]);
exit;
