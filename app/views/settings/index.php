<?php
// Settings: a read-only summary of how the system is set up.
// Everything here is configured in files or in the database, not from the
// browser, so the live SMTP credentials can never be changed by accident.

$activeUsers = 0;
foreach ($users as $user) {
    if ((int) $user['is_active'] === 1) {
        $activeUsers++;
    }
}
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Settings</h1>
        <p class="cb-page-sub">How this system is configured</p>
    </div>
    <a href="<?= BASE_URL ?>users" class="cb-btn cb-btn-outline">Manage Users</a>
</div>

<div class="cb-alert is-info">
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="flex-shrink:0;margin-top:2px;"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2"/></svg>
    <div>
        These values are set in the project's configuration files and in the database.
        They are shown here for reference and cannot be edited from this page.
    </div>
</div>

<div class="row g-3">
    <!-- ============ EMAIL ALERTS ============ -->
    <div class="col-12 col-lg-6">
        <div class="cb-card h-100">
            <div class="cb-card-head">
                <div>
                    <h2 class="cb-section-title">Email Alerts</h2>
                    <p class="cb-section-sub">Automatic low-stock notifications</p>
                </div>
                <span class="cb-badge is-healthy">Active</span>
            </div>
            <div class="cb-card-body">
                <table class="cb-table" style="font-size:13px;">
                    <tbody>
                        <tr>
                            <td class="cb-label" style="width:40%;">SMTP Host</td>
                            <td><?= htmlspecialchars($emailHost) ?></td>
                        </tr>
                        <tr>
                            <td class="cb-label">Port</td>
                            <td><?= htmlspecialchars((string) $emailPort) ?></td>
                        </tr>
                        <tr>
                            <td class="cb-label">Sender Account</td>
                            <td><?= htmlspecialchars($emailUser) ?></td>
                        </tr>
                        <tr>
                            <td class="cb-label">From Address</td>
                            <td><?= htmlspecialchars($emailFrom) ?></td>
                        </tr>
                        <tr>
                            <td class="cb-label">App Password</td>
                            <td><span class="text-muted">Stored in config, never displayed</span></td>
                        </tr>
                    </tbody>
                </table>
                <div class="cb-help mt-3">
                    Configured in <code>config/email.config.php</code>, which is excluded
                    from version control so the password is never committed.
                </div>
            </div>
        </div>
    </div>

    <!-- ============ ALERT RULES ============ -->
    <div class="col-12 col-lg-6">
        <div class="cb-card h-100">
            <div class="cb-card-head">
                <div>
                    <h2 class="cb-section-title">Alert Rules</h2>
                    <p class="cb-section-sub">When the system sends an email</p>
                </div>
            </div>
            <div class="cb-card-body">
                <div class="cb-stock-panel">
                    <div>
                        <div style="font-size:13px;font-weight:600;">Low-Stock Alert</div>
                        <div class="cb-help mt-1">Stock falls to or below the material's threshold</div>
                    </div>
                    <span class="cb-badge is-low">Staff + Manager</span>
                </div>
                <div class="cb-stock-panel">
                    <div>
                        <div style="font-size:13px;font-weight:600;">Stock-Out Alert</div>
                        <div class="cb-help mt-1">Stock reaches zero</div>
                    </div>
                    <span class="cb-badge is-out">Manager Only</span>
                </div>
                <div class="cb-stock-panel mb-0">
                    <div>
                        <div style="font-size:13px;font-weight:600;">Repeat Protection</div>
                        <div class="cb-help mt-1">The same alert is not resent within 24 hours</div>
                    </div>
                    <span class="cb-badge is-neutral">24 Hours</span>
                </div>
            </div>
        </div>
    </div>

    <!-- ============ ROLES ============ -->
    <div class="col-12 col-lg-6">
        <div class="cb-card h-100">
            <div class="cb-card-head">
                <div>
                    <h2 class="cb-section-title">Roles and Permissions</h2>
                    <p class="cb-section-sub">What each role is allowed to do</p>
                </div>
            </div>
            <div class="cb-card-body is-flush">
                <div class="cb-table-wrap">
                    <table class="cb-table">
                        <thead>
                            <tr>
                                <th>Action</th>
                                <th>Staff</th>
                                <th>Manager</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php
                            // Mirrors the checks in the controllers, kept here as a
                            // plain reference for the panel and for new managers
                            $permissions = [
                                'Log stock in / stock out' => [true, true],
                                'View materials catalog' => [true, true],
                                'Add materials' => [true, true],
                                'Edit / delete materials' => [false, true],
                                'See cost and supplier' => [false, true],
                                'View dashboard' => [false, true],
                                'View reports' => [false, true],
                                'Manage user accounts' => [false, true],
                            ];
                            ?>
                            <?php foreach ($permissions as $action => $allowed): ?>
                            <tr>
                                <td><?= $action ?></td>
                                <?php foreach ($allowed as $canDo): ?>
                                <td>
                                    <?php if ($canDo): ?>
                                    <span style="color: var(--cb-green);font-weight:700;">&#10003;</span>
                                    <?php else: ?>
                                    <span class="text-muted">&mdash;</span>
                                    <?php endif; ?>
                                </td>
                                <?php endforeach; ?>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- ============ SYSTEM ============ -->
    <div class="col-12 col-lg-6">
        <div class="cb-card h-100">
            <div class="cb-card-head">
                <div>
                    <h2 class="cb-section-title">System</h2>
                    <p class="cb-section-sub">Current state of the installation</p>
                </div>
            </div>
            <div class="cb-card-body">
                <table class="cb-table" style="font-size:13px;">
                    <tbody>
                        <tr>
                            <td class="cb-label" style="width:50%;">Application</td>
                            <td><?= APP_NAME ?></td>
                        </tr>
                        <tr>
                            <td class="cb-label">Materials Tracked</td>
                            <td><?= $totalMaterials ?></td>
                        </tr>
                        <tr>
                            <td class="cb-label">Needing Reorder</td>
                            <td>
                                <?php if ($lowStockCount > 0): ?>
                                <span class="cb-badge is-low"><?= $lowStockCount ?></span>
                                <?php else: ?>
                                <span class="cb-badge is-healthy">None</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <tr>
                            <td class="cb-label">User Accounts</td>
                            <td><?= $activeUsers ?> active of <?= count($users) ?></td>
                        </tr>
                        <tr>
                            <td class="cb-label">Deployment</td>
                            <td>Local area network (XAMPP)</td>
                        </tr>
                        <tr>
                            <td class="cb-label">PHP Version</td>
                            <td><?= PHP_VERSION ?></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
