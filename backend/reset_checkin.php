<?php
// backend/reset_checkin.php
require_once 'utils.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Must be logged in
if (!isset($_SESSION['email'])) {
    echo json_encode([
        'success' => false,
        'message' => 'Not authenticated'
    ]);
    exit;
}

$email = $_SESSION['email'];
$data  = read_data();

$index = get_user_index($data, $email);
if ($index === -1) {
    echo json_encode([
        'success' => false,
        'message' => 'User not found'
    ]);
    exit;
}

$user = &$data['users'][$index];

// Today's date in WIB
$today = new DateTime('now', new DateTimeZone('Asia/Jakarta'));
$todayStr = $today->format('Y-m-d');

// Remove today's entry (if exists)
if (isset($user['entries']) && is_array($user['entries'])) {
    $filtered = [];

    foreach ($user['entries'] as $entry) {
        // Skip today's entry
        if (isset($entry['date']) && $entry['date'] === $todayStr) {
            continue;
        }
        $filtered[] = $entry;
    }

    $user['entries'] = $filtered;
}

// Optional: store reset flag
$user['resetCheckIn'] = true;

// Save file
if (!write_data($data)) {
    echo json_encode([
        'success' => false,
        'message' => 'Failed to save data'
    ]);
    exit;
}

// Recalculate streak & recap using new format
$streak = calculate_streak($user['entries']);
$recap  = generate_recap($user['entries']);

echo json_encode([
    'success' => true,
    'message' => "Today's check-in reset.",
    'streak'  => $streak,
    'recap'   => $recap
]);
exit;
