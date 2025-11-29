<?php
// backend/utils.php
session_start();

// Ensure WIB timezone
date_default_timezone_set('Asia/Jakarta');

define('DATA_FILE', __DIR__ . '/../data/data.json');


/**
 * Safely read JSON data file into array.
 */
function read_data()
{
    if (!file_exists(DATA_FILE)) {
        $initial = ['users' => []];
        file_put_contents(DATA_FILE, json_encode($initial, JSON_PRETTY_PRINT), LOCK_EX);
        return $initial;
    }

    $json = file_get_contents(DATA_FILE);
    $data = json_decode($json, true);

    if (!is_array($data)) {
        $data = ['users' => []];
    }
    if (!isset($data['users']) || !is_array($data['users'])) {
        $data['users'] = [];
    }

    return $data;
}


/**
 * Write JSON with file locking.
 */
function write_data($data)
{
    $fp = fopen(DATA_FILE, 'c+');
    if (!$fp) return false;

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        return false;
    }

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data, JSON_PRETTY_PRINT));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    return true;
}


/**
 * Find user index by email.
 */
function get_user_index($data, $email)
{
    foreach ($data['users'] as $i => $user) {
        if (isset($user['email']) &&
            strtolower($user['email']) === strtolower($email)) {
            return $i;
        }
    }
    return -1;
}


/**
 * Build date → entry map.
 */
function build_entries_by_date($entries)
{
    $map = [];
    if (!is_array($entries)) return $map;

    foreach ($entries as $entry) {
        if (!isset($entry['date'])) continue;
        $map[$entry['date']] = $entry;
    }

    ksort($map);
    return $map;
}


/**
 * Streak = consecutive days ending today.
 */
function calculate_streak($entries)
{
    $map = build_entries_by_date($entries);
    if (empty($map)) return 0;

    $today = new DateTime('today');
    $streak = 0;

    while (true) {
        $dateStr = $today->format('Y-m-d');
        if (isset($map[$dateStr])) {
            $streak++;
            $today->modify('-1 day');
        } else {
            break;
        }
    }

    return $streak;
}


/**
 * Emotion ranking for improvement detection.
 */
function emotion_rank($label)
{
    $label = strtolower($label);

    if ($label === 'sad')   return 1;
    if ($label === 'angry') return 1;

    if ($label === 'happy') return 3;

    return 2; // default neutral
}


/**
 * Generate insight/recap messages using new format:
 * entry['final'] only.
 */
function generate_recap($entries)
{
    $messages = [];
    $map = build_entries_by_date($entries);
    if (empty($map)) return $messages;

    $today = new DateTime('today');
    $todayStr = $today->format('Y-m-d');

    // Build last 7 days → emotion label
    $emotionLast7 = [];
    for ($i = 6; $i >= 0; $i--) {
        $d = (clone $today)->modify("-{$i} day")->format('Y-m-d');
        $emotionLast7[$d] = isset($map[$d]['final']) ? $map[$d]['final'] : null;
    }

    // --- Streak of same emotion ---
    if ($emotionLast7[$todayStr] !== null) {
        $current = $emotionLast7[$todayStr];
        $runLen = 1;

        $cursor = (clone $today)->modify('-1 day');
        while (true) {
            $ds = $cursor->format('Y-m-d');
            if (!isset($emotionLast7[$ds]) || $emotionLast7[$ds] !== $current) {
                break;
            }
            $runLen++;
            $cursor->modify('-1 day');
        }

        if ($runLen >= 2) {
            $messages[] = "You have been {$current} for {$runLen} days in a row.";
        }
    }

    // --- Happiness improved (last 7 vs prev 7) ---
    $happyLast7 = 0;
    $happyPrev7 = 0;

    // last 7 days
    for ($i = 0; $i < 7; $i++) {
        $d = (clone $today)->modify("-{$i} day")->format('Y-m-d');
        if (isset($map[$d]['final']) && strtolower($map[$d]['final']) === 'happy') {
            $happyLast7++;
        }
    }

    // prev 7 days
    for ($i = 7; $i < 14; $i++) {
        $d = (clone $today)->modify("-{$i} day")->format('Y-m-d');
        if (isset($map[$d]['final']) && strtolower($map[$d]['final']) === 'happy') {
            $happyPrev7++;
        }
    }

    if ($happyLast7 > $happyPrev7 && $happyLast7 > 0) {
        $messages[] = "Your happiness increased this week.";
    }

    // --- Yesterday vs Today change ---
    $yesterday = (new DateTime('yesterday'))->format('Y-m-d');

    if (isset($map[$yesterday]['final']) && isset($map[$todayStr]['final'])) {
        $yEmotion = $map[$yesterday]['final'];
        $tEmotion = $map[$todayStr]['final'];

        if ($yEmotion !== $tEmotion) {
            $rankY = emotion_rank($yEmotion);
            $rankT = emotion_rank($tEmotion);

            if ($rankT > $rankY) {
                $messages[] = "Yesterday your emotion was {$yEmotion}, today it improved to {$tEmotion}.";
            } else {
                $messages[] = "Yesterday your emotion was {$yEmotion}, today it changed to {$tEmotion}.";
            }
        }
    }

    return array_values(array_unique($messages));
}
