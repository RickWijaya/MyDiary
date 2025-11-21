<?php
// backend/login.php
require_once 'utils.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ../login.html');
    exit;
}

$email = isset($_POST['email']) ? trim($_POST['email']) : '';
$password = isset($_POST['password']) ? trim($_POST['password']) : '';

if ($email === '' || $password === '') {
    header('Location: ../login.html?error=empty');
    exit;
}

$data = read_data();
$index = get_user_index($data, $email);

if ($index === -1) {
    // user not found
    header('Location: ../login.html?error=invalid');
    exit;
}

// NOTE: for demo we store plain text password.
// In production, use password_hash/password_verify.
$storedPassword = $data['users'][$index]['password'];

if ($storedPassword !== $password) {
    header('Location: ../login.html?error=invalid');
    exit;
}

// Success
$_SESSION['email'] = $email;
header('Location: ../dashboard.html');
exit;
