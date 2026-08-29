<?php
// Create a new staff or general manager account
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Add Staff Account</h1>
        <p class="cb-page-sub">Create a login for a member of the team</p>
    </div>
    <a href="<?= BASE_URL ?>users" class="cb-btn cb-btn-outline">Back to Users</a>
</div>

<?php if (!empty($errors)): ?>
<div class="cb-alert is-danger">
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="flex-shrink:0;margin-top:2px;"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>
    <div>
        <strong>Please check the form</strong>
        <ul class="mt-1">
            <?php foreach ($errors as $error): ?><li><?= htmlspecialchars($error) ?></li><?php endforeach; ?>
        </ul>
    </div>
</div>
<?php endif; ?>

<div class="row">
    <div class="col-12 col-lg-7">
        <div class="cb-card">
            <div class="cb-card-body">
                <form method="POST" action="<?= BASE_URL ?>users/create" novalidate>
                    <div class="cb-field">
                        <label class="cb-field-label">Full Name</label>
                        <input type="text" name="name" class="cb-input" required
                               value="<?= htmlspecialchars($_POST['name'] ?? '') ?>">
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Email</label>
                        <input type="email" name="email" class="cb-input" required
                               value="<?= htmlspecialchars($_POST['email'] ?? '') ?>">
                        <div class="cb-help">Low-stock alert emails are sent to this address.</div>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Role</label>
                        <select name="role" class="cb-select" required>
                            <option value="">-- Select role --</option>
                            <option value="production_staff" <?= (($_POST['role'] ?? '') === 'production_staff') ? 'selected' : '' ?>>Production Staff</option>
                            <option value="general_manager" <?= (($_POST['role'] ?? '') === 'general_manager') ? 'selected' : '' ?>>General Manager</option>
                        </select>
                        <div class="cb-help">Production staff cannot see costs, suppliers, or reports.</div>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Password</label>
                        <input type="password" name="password" class="cb-input" required minlength="8"
                               autocomplete="new-password">
                        <div class="cb-help">At least 8 characters.</div>
                    </div>

                    <div class="d-flex gap-2 mt-4">
                        <button type="submit" class="cb-btn cb-btn-primary">Create Account</button>
                        <a href="<?= BASE_URL ?>users" class="cb-btn cb-btn-outline">Cancel</a>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <div class="col-12 col-lg-5">
        <div class="cb-card">
            <div class="cb-card-head">
                <h2 class="cb-section-title">About accounts</h2>
            </div>
            <div class="cb-card-body">
                <ul class="text-muted mb-0" style="font-size:13px;padding-left:18px;line-height:1.9;">
                    <li>Accounts are never deleted, only deactivated, so past
                        movement records always keep the name of who logged them.</li>
                    <li>Deactivated accounts cannot log in and stop receiving
                        alert emails.</li>
                    <li>Passwords are stored as secure hashes, never as plain text.</li>
                </ul>
            </div>
        </div>
    </div>
</div>
