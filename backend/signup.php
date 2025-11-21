<?php
// backend/signup.php
require_once 'utils.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ../signup.html');
    exit;
}

$email    = isset($_POST['email']) ? trim($_POST['email']) : '';
$password = isset($_POST['password']) ? trim($_POST['password']) : '';
$confirm  = isset($_POST['confirm_password']) ? trim($_POST['confirm_password']) : '';

if ($email === '' || $password === '' || $confirm === '') {
    header('Location: ../signup.html?error=empty');
    exit;
}

if ($password !== $confirm) {
    header('Location: ../signup.html?error=nomatch');
    exit;
}

$data = read_data();
$index = get_user_index($data, $email);

if ($index !== -1) {
    // email already exists
    header('Location: ../signup.html?error=exists');
    exit;
}

// In production, use password_hash.
$newUser = [
    'email'    => $email,
    'password' => $password,
    'entries'  => []
];

$data['users'][] = $newUser;

if (!write_data($data)) {
    header('Location: ../signup.html?error=server');
    exit;
}

// success
header('Location: ../login.html?signup=success');
exit;
