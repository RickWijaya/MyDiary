<?php
// backend/save_entry.php
require_once 'utils.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

if (!isset($_SESSION['email'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

$date = isset($payload['date']) ? $payload['date'] : null;
$diary = isset($payload['diary']) ? $payload['diary'] : null;
$face = isset($payload['face']) ? $payload['face'] : null;
$voice = isset($payload['voice']) ? $payload['voice'] : null;
$final = isset($payload['final']) ? $payload['final'] : null;

// Basic validation for new structure
if (
    !$date ||
    !$diary ||
    !is_array($face) ||
    !is_array($voice) ||
    !$final
) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing or invalid fields']);
    exit;
}

// Override final emotion if diary text strongly suggests otherwise
if ($diary) {
    $text_emotion = analyze_text_emotion($diary);
    if ($text_emotion) {
        $final = $text_emotion;
        // Also override face scores so the graph reflects the text emotion
        $face = ['happy' => 0, 'sad' => 0, 'angry' => 0];
        $face[$text_emotion] = 1.0;
    }
}


$data = read_data();
$email = $_SESSION['email'];
$index = get_user_index($data, $email);

if ($index === -1) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'User not found']);
    exit;
}

// Ensure entries array
if (!isset($data['users'][$index]['entries']) || !is_array($data['users'][$index]['entries'])) {
    $data['users'][$index]['entries'] = [];
}

$entries = $data['users'][$index]['entries'];
$found = false;

// Replace existing entry for this date, or add new
foreach ($entries as $i => $entry) {
    if (isset($entry['date']) && $entry['date'] === $date) {
        $entries[$i] = [
            'date' => $date,
            'diary' => $diary,
            'face' => $face,
            'voice' => $voice,
            'final' => $final,
        ];
        $found = true;
        break;
    }
}

if (!$found) {
    $entries[] = [
        'date' => $date,
        'diary' => $diary,
        'face' => $face,
        'voice' => $voice,
        'final' => $final,
    ];
}

// Save back
$data['users'][$index]['entries'] = $entries;

if (!write_data($data)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to save data']);
    exit;
}

// Return updated streak & recap for instant refresh
$streak = calculate_streak($entries);
$recap = generate_recap($entries);

echo json_encode([
    'success' => true,
    'streak' => $streak,
    'recap' => $recap,
]);
exit;
