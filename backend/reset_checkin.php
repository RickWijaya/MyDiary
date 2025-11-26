<?php
// backend/reset_checkin.php
require_once 'utils.php';

header('Content-Type: application/json');

// must be logged in
if (!isset($_SESSION['email'])) {
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
    echo json_encode([
        'success' => false,
        'message' => 'User not found'
    ]);
    exit;
}

$user = &$data['users'][$index];

// today's date
$today = (new DateTime('today'))->format('Y-m-d');

// remove today's entry if exists
if (isset($user['entries']) && is_array($user['entries'])) {
    $newEntries = [];
    foreach ($user['entries'] as $entry) {
        if ($entry['date'] !== $today) {
            $newEntries[] = $entry;
        }
    }
    $user['entries'] = $newEntries;
}

// mark reset flag (optional)
$user['resetCheckIn'] = true;

// save file
write_data($data);

// recalc streak and recap
$streak = calculate_streak($user['entries']);
$recap  = generate_recap($user['entries']);

echo json_encode([
    'success' => true,
    'message' => 'Today\'s check-in reset',
    'streak' => $streak,
    'recap' => $recap
]);
