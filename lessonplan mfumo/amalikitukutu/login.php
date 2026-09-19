<?php
require_once __DIR__ . '/includes/auth.php';
startAuth();
if (!empty($_SESSION['user_id'])) { header('Location: /amalikitukutu/index.php'); exit; }

$error = '';
$email = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = (string)($_POST['password'] ?? '');

    if ($email === '' || $password === '') {
        $error = 'Please enter your email and password.';
    } else {
        $db = getDB();
        $st = $db->prepare("SELECT * FROM users WHERE email=?");
        $st->execute([$email]);
        $user = $st->fetch();

        if ($user && password_verify($password, $user['password'])) {
            session_regenerate_id(true);
            $_SESSION['user_id'] = (int)$user['id'];
            $_SESSION['user'] = [
                'id'         => (int)$user['id'],
                'role'       => $user['role'],
                'first_name' => $user['first_name'],
                'last_name'  => $user['last_name'],
                'email'      => $user['email'],
                'name'       => trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?: $user['email'],
            ];
            header('Location: /amalikitukutu/index.php');
            exit;
        }
        $error = 'Invalid email or password.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In — Lesson Plan Generator</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 55%, #134e4a 100%);
            padding: 20px;
        }
        .login-card {
            background: #fff;
            border-radius: 18px;
            box-shadow: 0 24px 60px rgba(0,0,0,0.35);
            padding: 40px 36px;
            width: 100%;
            max-width: 400px;
        }
        .brand-icon {
            width: 56px; height: 56px;
            border-radius: 14px;
            background: linear-gradient(135deg,#0d9488,#0891b2);
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 16px;
            font-size: 26px; color: #fff;
        }
        h1 { font-size: 20px; font-weight: 700; text-align: center; color: #111827; margin: 0 0 4px; }
        .subtitle { font-size: 13px; color: #6b7280; text-align: center; margin: 0 0 24px; }
        .form-label { font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .form-control {
            border-radius: 9px; padding: 11px 13px; font-size: 14px;
            border: 1px solid #d1d5db;
        }
        .form-control:focus { border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13,148,136,0.15); }
        .btn-signin {
            width: 100%; border-radius: 9px; padding: 12px; font-weight: 600; font-size: 14px;
            background: linear-gradient(135deg,#0d9488,#0891b2); border: none; color: #fff;
        }
        .btn-signin:hover { filter: brightness(1.05); }
        .alert-danger { border-radius: 9px; font-size: 13px; }
        .login-foot { font-size: 12px; color: #9ca3af; text-align: center; margin-top: 22px; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="login-card">
        <div class="brand-icon"><i class="bi bi-journal-richtext"></i></div>
        <h1>Lesson Planner</h1>
        <p class="subtitle">EduProx systems — Sign in to continue</p>

        <?php if ($error): ?>
        <div class="alert alert-danger"><i class="bi bi-exclamation-circle me-1"></i><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <form method="post" action="login.php" autocomplete="on">
            <div class="mb-3">
                <label class="form-label" for="email">Email Address</label>
                <input type="email" id="email" name="email" class="form-control" required autofocus
                       value="<?= htmlspecialchars($email) ?>" placeholder="teacher@school.ac.tz">
            </div>
            <div class="mb-4">
                <label class="form-label" for="password">Password</label>
                <input type="password" id="password" name="password" class="form-control" required placeholder="••••••••">
            </div>
            <button type="submit" class="btn btn-signin"><i class="bi bi-box-arrow-in-right me-2"></i>Sign In</button>
        </form>

        <div class="login-foot">
            Teachers use their school login credentials.<br>
            Admin accounts have full access to all subjects.
        </div>
    </div>
</body>
</html>
