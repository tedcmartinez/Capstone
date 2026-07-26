<?php
// Create a new staff or general manager account
?>
<h3 class="mb-3">Add Staff Account</h3>

<?php if (!empty($errors)): ?>
<div class="alert alert-danger">
    <ul class="mb-0">
        <?php foreach ($errors as $error): ?><li><?= htmlspecialchars($error) ?></li><?php endforeach; ?>
    </ul>
</div>
<?php endif; ?>

<form method="POST" action="<?= BASE_URL ?>users/create" novalidate>
    <div class="mb-3">
        <label class="form-label">Full Name</label>
        <input type="text" name="name" class="form-control" required value="<?= htmlspecialchars($_POST['name'] ?? '') ?>">
    </div>
    <div class="mb-3">
        <label class="form-label">Email</label>
        <input type="email" name="email" class="form-control" required value="<?= htmlspecialchars($_POST['email'] ?? '') ?>">
    </div>
    <div class="mb-3">
        <label class="form-label">Role</label>
        <select name="role" class="form-select" required>
            <option value="">-- Select role --</option>
            <option value="production_staff" <?= (($_POST['role'] ?? '') === 'production_staff') ? 'selected' : '' ?>>Production Staff</option>
            <option value="general_manager" <?= (($_POST['role'] ?? '') === 'general_manager') ? 'selected' : '' ?>>General Manager</option>
        </select>
    </div>
    <div class="mb-3">
        <label class="form-label">Password</label>
        <input type="password" name="password" class="form-control" required minlength="8">
        <div class="form-text">At least 8 characters.</div>
    </div>
    <button type="submit" class="btn btn-success">Create Account</button>
    <a href="<?= BASE_URL ?>users" class="btn btn-secondary">Cancel</a>
</form>
