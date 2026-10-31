<?php
// Low stock report: everything at or below its minimum threshold.
// Out-of-stock items come first because they are the most urgent.
?>

<div class="cb-page-head d-print-none">
    <div>
        <h1 class="cb-page-title">Low Stock Report</h1>
        <p class="cb-page-sub">Materials needing attention as of <?= date('F j, Y') ?></p>
    </div>
    <div class="d-flex gap-2">
        <button type="button" class="cb-btn cb-btn-outline" onclick="window.print();">
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/></svg>
            Print
        </button>
        <a href="<?= BASE_URL ?>checklist" class="cb-btn cb-btn-primary">Send Reorder Checklist</a>
    </div>
</div>

<?php require ROOT_PATH . '/app/views/reports/_tabs.php'; ?>

<div class="row g-3 mb-3">
    <div class="col-6">
        <div class="cb-kpi is-out">
            <div class="cb-kpi-label mb-2">Out of Stock</div>
            <div class="cb-kpi-value <?= $outCount > 0 ? 'is-critical' : '' ?>"><?= $outCount ?></div>
            <div class="cb-kpi-foot">cannot be used until restocked</div>
        </div>
    </div>
    <div class="col-6">
        <div class="cb-kpi is-low">
            <div class="cb-kpi-label mb-2">Low Stock</div>
            <div class="cb-kpi-value <?= $lowCount > 0 ? 'is-warning' : '' ?>"><?= $lowCount ?></div>
            <div class="cb-kpi-foot">running low, reorder soon</div>
        </div>
    </div>
</div>

<div class="cb-card">
    <div class="cb-card-body is-flush">
        <?php if (empty($materials)): ?>
        <div class="cb-empty">
            <div class="cb-empty-icon">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>
            </div>
            <div class="cb-empty-title">Nothing to reorder</div>
            <p class="cb-empty-text">Every material is above its minimum threshold.</p>
        </div>
        <?php else: ?>
        <div class="cb-table-wrap">
        <table class="cb-table">
            <thead>
                <tr>
                    <th>Material</th>
                    <th>Category</th>
                    <th class="cb-num">Current Stock</th>
                    <th class="cb-num">Min Threshold</th>
                    <th class="cb-num">Shortfall</th>
                    <th>Status</th>
                    <th>Supplier</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($materials as $material): ?>
                <?php
                    $st = stockStatus($material['stock_quantity'], $material['min_threshold']);
                    // How many units short of the threshold this material is
                    $shortfall = max(0, (int) $material['min_threshold'] - (int) $material['stock_quantity']);
                ?>
                <tr>
                    <td class="cb-cell-name"><?= htmlspecialchars($material['name']) ?></td>
                    <td><span class="cb-chip"><?= htmlspecialchars($material['category']) ?></span></td>
                    <td class="cb-num">
                        <span class="cb-cell-stock"><?= (int) $material['stock_quantity'] ?></span>
                        <span class="text-muted"><?= htmlspecialchars($material['unit']) ?></span>
                    </td>
                    <td class="cb-num text-muted"><?= (int) $material['min_threshold'] ?></td>
                    <td class="cb-num">
                        <?php if ($shortfall > 0): ?>
                        <strong style="color: var(--cb-red);">-<?= $shortfall ?></strong>
                        <?php else: ?>
                        <span class="text-muted">0</span>
                        <?php endif; ?>
                    </td>
                    <td><span class="cb-badge is-<?= $st ?>"><?= stockStatusLabel($st) ?></span></td>
                    <td class="text-muted"><?= htmlspecialchars($material['supplier_name'] ?? '-') ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php endif; ?>
    </div>
</div>
