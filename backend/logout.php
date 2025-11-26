<?php
// backend/logout.php
require_once 'utils.php';

// Clear all session data
$_SESSION = [];
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params["path"],
        $params["domain"],
        $params["secure"],
        $params["httponly"]
    );
}

// Destroy session and redirect to login
session_destroy();
header('Location: ../login.html');
exit;
