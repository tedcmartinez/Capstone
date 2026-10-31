<?php
// User account management: list all staff and GM accounts.
// Accounts are never deleted, only deactivated/reactivated, so their
// movement history stays intact.

$activeCount = 0;
foreach ($users as $user) {
    if ((int) $user['is_active'] === 1) {
        $activeCount++;
    }
}
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">User Accounts</h1>
        <p class="cb-page-sub"><?= $activeCount ?> active of <?= count($users) ?> account<?= count($users) === 1 ? '' : 's' ?></p>
    </div>
    <a href="<?= BASE_URL ?>users/create" class="cb-btn cb-btn-primary">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
        Add Staff Account
    </a>
</div>

<div class="cb-card">
    <div class="cb-card-body is-flush">
        <div class="cb-table-wrap">
        <table class="cb-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th class="cb-num">Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($users as $user): ?>
                <?php
                    $isActive = (int) $user['is_active'] === 1;
                    $isManager = $user['role'] === 'general_manager';
                ?>
                <tr>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <?php
                            // Initials avatar, same style as the top bar
                            $initials = '';
                            foreach (explode(' ', trim($user['name'])) as $part) {
                                if ($part !== '') {
                                    $initials .= strtoupper($part[0]);
                                }
                            }
                            ?>
                            <span class="cb-avatar" style="width:28px;height:28px;font-size:11px;">
                                <?= htmlspecialchars(substr($initials, 0, 2)) ?>
                            </span>
                            <span class="cb-cell-name"><?= htmlspecialchars($user['name']) ?></span>
                        </div>
                    </td>
                    <td class="text-muted"><?= htmlspecialchars($user['email']) ?></td>
                    <td>
                        <span class="cb-badge <?= $isManager ? 'is-brand' : 'is-neutral' ?>">
                            <?= $isManager ? 'General Manager' : 'Production Staff' ?>
                        </span>
                    </td>
                    <td>
                        <span class="cb-badge <?= $isActive ? 'is-healthy' : 'is-neutral' ?>">
                            <?= $isActive ? 'Active' : 'Deactivated' ?>
                        </span>
                    </td>
                    <td class="cb-num">
                        <form method="POST" action="<?= BASE_URL ?>users/toggle/<?= $user['user_id'] ?>" class="d-inline"
                              onsubmit="return confirm('<?= $isActive ? 'Deactivate' : 'Reactivate' ?> the account for <?= htmlspecialchars(addslashes($user['name'])) ?>?');">
                            <button type="submit" class="cb-btn cb-btn-outline cb-btn-sm"
                                    style="<?= $isActive ? 'color: var(--cb-red);' : 'color: var(--cb-green);' ?>">
                                <?= $isActive ? 'Deactivate' : 'Reactivate' ?>
                            </button>
                        </form>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
    </div>
</div>
