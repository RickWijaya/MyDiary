<?php
// backend/utils.php
session_start();

define('DATA_FILE', __DIR__ . '/../data/data.json');

/**
 * Safely read JSON data file into associative array.
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
 * Safely write array back to JSON data file with locking.
 */
function write_data($data)
{
    $fp = fopen(DATA_FILE, 'c+');
    if (!$fp) {
        return false;
    }

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
 * Find user index by email (case-insensitive). Returns -1 if not found.
 */
function get_user_index($data, $email)
{
    foreach ($data['users'] as $index => $user) {
        if (isset($user['email']) &&
            strtolower($user['email']) === strtolower($email)) {
            return $index;
        }
    }
    return -1;
}

/**
 * Build a date => entry map and sort by date ascending.
 */
function build_entries_by_date($entries)
{
    $map = [];
    if (!is_array($entries)) {
        return $map;
    }

    foreach ($entries as $entry) {
        if (!isset($entry['date'])) continue;
        $map[$entry['date']] = $entry;
    }

    ksort($map);
    return $map;
}

/**
 * Calculate current streak (consecutive days up to today with entries).
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
 * Simple ranking to decide "improvement" of emotion.
 */
function emotion_rank($label)
{
    $label = strtolower($label);
    $negative = ['sad', 'angry', 'fear', 'disgust'];
    $neutral  = ['neutral', 'calm', 'surprise'];
    $positive = ['happy', 'excited', 'joy'];

    if (in_array($label, $negative)) return 1;
    if (in_array($label, $neutral))  return 2;
    if (in_array($label, $positive)) return 3;

    return 2; // default neutral
}

/**
 * Generate recap / insight messages based on entries from last days.
 */
function generate_recap($entries)
{
    $messages = [];
    $map = build_entries_by_date($entries);
    if (empty($map)) return $messages;

    $today = new DateTime('today');
    $todayStr = $today->format('Y-m-d');

    // Build last 7 days emotion map (date => final emotion or null)
    $emotionLast7 = [];
    for ($i = 6; $i >= 0; $i--) {
        $d = (clone $today)->modify("-{$i} day")->format('Y-m-d');
        if (isset($map[$d]['emotion']['final'])) {
            $emotionLast7[$d] = $map[$d]['emotion']['final'];
        } else {
            $emotionLast7[$d] = null;
        }
    }

    // 1) "You have been X for N days in a row."
    if (isset($emotionLast7[$todayStr]) && $emotionLast7[$todayStr] !== null) {
        $currentEmotion = $emotionLast7[$todayStr];
        $runLen = 1;
        $cursor = (clone $today)->modify('-1 day');

        while (true) {
            $ds = $cursor->format('Y-m-d');
            if (!isset($emotionLast7[$ds]) || $emotionLast7[$ds] !== $currentEmotion) {
                break;
            }
            $runLen++;
            $cursor->modify('-1 day');
        }

        if ($runLen >= 2) {
            $messages[] = "You have been {$currentEmotion} for {$runLen} days in a row.";
        }
    }

    // 2) "Your happiness increased this week."
    // Count 'happy' in last 7 vs previous 7 days.
    $happyCountLast7 = 0;
    $happyCountPrev7 = 0;

    // Last 7
    for ($i = 0; $i < 7; $i++) {
        $d = (clone $today)->modify("-{$i} day")->format('Y-m-d');
        if (isset($map[$d]['emotion']['final']) &&
            strtolower($map[$d]['emotion']['final']) === 'happy') {
            $happyCountLast7++;
        }
    }
    // Previous 7
    for ($i = 7; $i < 14; $i++) {
        $d = (clone $today)->modify("-{$i} day")->format('Y-m-d');
        if (isset($map[$d]['emotion']['final']) &&
            strtolower($map[$d]['emotion']['final']) === 'happy') {
            $happyCountPrev7++;
        }
    }

    if ($happyCountLast7 > $happyCountPrev7 && $happyCountLast7 > 0) {
        $messages[] = "Your happiness increased this week.";
    }

    // 3) "Yesterday your emotion was X, today it improved to Y."
    $yesterday = (new DateTime('yesterday'))->format('Y-m-d');

    if (isset($map[$yesterday]['emotion']['final']) &&
        isset($map[$todayStr]['emotion']['final'])) {

        $yEmotion = $map[$yesterday]['emotion']['final'];
        $tEmotion = $map[$todayStr]['emotion']['final'];

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

    // Remove duplicates just in case.
    $messages = array_values(array_unique($messages));

    return $messages;
}
