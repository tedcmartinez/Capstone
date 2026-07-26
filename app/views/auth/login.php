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
<body class="bg-light">
<div class="container">
    <div class="row justify-content-center mt-5">
        <div class="col-md-5">
            <div class="card shadow-sm">
                <!-- Brand banner: the Cornerblock wordmark on dark brown -->
                <div class="cb-login-banner">
                    <span class="cb-logo">Cornerblock</span>
                </div>
                <div class="card-body p-4">
                    <p class="text-center text-muted mb-4">Materials Inventory Management System</p>

                    <?php if (!empty($errors)): ?>
                    <div class="alert alert-danger">
                        <ul class="mb-0">
                            <?php foreach ($errors as $error): ?>
                            <li><?= htmlspecialchars($error) ?></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>
                    <?php endif; ?>

                    <form method="POST" action="<?= BASE_URL ?>login" novalidate>
                        <div class="mb-3">
                            <label for="email" class="form-label">Email</label>
                            <input type="email" class="form-control" id="email" name="email" required
                                   value="<?= htmlspecialchars($old['email'] ?? '') ?>">
                        </div>
                        <div class="mb-3">
                            <label for="password" class="form-label">Password</label>
                            <input type="password" class="form-control" id="password" name="password" required>
                        </div>
                        <button type="submit" class="btn btn-primary w-100">Log In</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>
</body>
</html>
