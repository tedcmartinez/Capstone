<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - <?= APP_NAME ?></title>
    <link rel="stylesheet" href="<?= BASE_URL ?>css/bootstrap.min.css">
    <!-- The ?v= timestamp changes whenever style.css is edited, which
         forces browsers to fetch the latest version instead of a cached copy -->
    <link rel="stylesheet" href="<?= BASE_URL ?>css/style.css?v=<?= filemtime(ROOT_PATH . '/public/css/style.css') ?>">
</head>
<body>
<!-- Standalone page: no sidebar or top bar, just the branded login card -->
<div class="cb-login">
    <div class="cb-login-card">
        <div class="cb-login-head">
            <div class="cb-login-mark">C</div>
            <div class="cb-login-word">Cornerblock</div>
            <div class="cb-login-tag">Materials Inventory Management System</div>
        </div>

        <div class="cb-login-body">
            <?php if (!empty($errors)): ?>
            <div class="cb-alert is-danger">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="flex-shrink:0;margin-top:2px;"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>
                <div>
                    <?php foreach ($errors as $error): ?>
                    <div><?= htmlspecialchars($error) ?></div>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php endif; ?>

            <form method="POST" action="<?= BASE_URL ?>login" novalidate>
                <div class="cb-field">
                    <label for="email" class="cb-field-label">Email</label>
                    <input type="email" class="cb-input" id="email" name="email" required
                           autocomplete="username" autofocus
                           value="<?= htmlspecialchars($old['email'] ?? '') ?>">
                </div>
                <div class="cb-field">
                    <label for="password" class="cb-field-label">Password</label>
                    <input type="password" class="cb-input" id="password" name="password" required
                           autocomplete="current-password">
                </div>
                <button type="submit" class="cb-btn cb-btn-primary w-100">Log In</button>
            </form>

            <p class="cb-help text-center mt-4 mb-0">
                Cornerblock Trading Inc. &middot; Internal use only
            </p>
        </div>
    </div>
</div>
</body>
</html>
