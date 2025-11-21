<?php
// backend/get_user_data.php
require_once 'utils.php';

header('Content-Type: application/json');

if (!isset($_SESSION['email'])) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Not authenticated'
    ]);
    exit;
}

$email = $_SESSION['email'];

$data = read_data();
$index = get_user_index($data, $email);

if ($index === -1) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'message' => 'User not found'
    ]);
    exit;
}

$user = $data['users'][$index];

if (!isset($user['entries']) || !is_array($user['entries'])) {
    $user['entries'] = [];
}

$streak = calculate_streak($user['entries']);
$recap  = generate_recap($user['entries']);

echo json_encode([
    'success' => true,
    'email'   => $user['email'],
    'entries' => $user['entries'],
    'streak'  => $streak,
    'recap'   => $recap
]);
exit;
