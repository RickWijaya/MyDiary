<?php
// backend/get_user_data.php
require_once 'utils.php';
header('Content-Type: application/json');

// not logged in
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
$entries = isset($user['entries']) ? $user['entries'] : [];

// your existing helper functions
$streak = calculate_streak($entries);
$recap  = generate_recap($entries);

echo json_encode([
    'success' => true,
    'email'   => $user['email'],
    'entries' => $entries,
    'streak'  => $streak,
    'recap'   => $recap
]);
