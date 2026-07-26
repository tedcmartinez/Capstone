<?php
// User account management: list all staff and GM accounts.
// Accounts are never deleted, only deactivated/reactivated.
?>
<div class="d-flex justify-content-between align-items-center mb-3">
    <h3>User Accounts</h3>
    <a href="<?= BASE_URL ?>users/create" class="btn btn-success">+ Add Staff Account</a>
</div>

<table class="table table-bordered table-hover">
    <thead class="table-dark">
        <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
    </thead>
    <tbody>
        <?php foreach ($users as $user): ?>
        <tr>
            <td><?= htmlspecialchars($user['name']) ?></td>
            <td><?= htmlspecialchars($user['email']) ?></td>
            <td><?= $user['role'] === 'general_manager' ? 'General Manager' : 'Production Staff' ?></td>
            <td>
                <?php if ((int) $user['is_active'] === 1): ?>
                <span class="badge bg-success">Active</span>
                <?php else: ?>
                <span class="badge bg-secondary">Deactivated</span>
                <?php endif; ?>
            </td>
            <td>
                <form method="POST" action="<?= BASE_URL ?>users/toggle/<?= $user['user_id'] ?>" class="d-inline"
                      onsubmit="return confirm('<?= (int) $user['is_active'] === 1 ? 'Deactivate' : 'Reactivate' ?> this account?');">
                    <button type="submit" class="btn btn-sm <?= (int) $user['is_active'] === 1 ? 'btn-outline-danger' : 'btn-outline-success' ?>">
                        <?= (int) $user['is_active'] === 1 ? 'Deactivate' : 'Reactivate' ?>
                    </button>
                </form>
            </td>
        </tr>
        <?php endforeach; ?>
    </tbody>
</table>
