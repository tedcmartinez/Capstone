<?php
// Inventory value report: what the stock on hand is worth, material by
// material, plus a breakdown per category. Most valuable items first.

// The largest category value sets the width of the comparison bars
$maxCategoryValue = 0;
foreach ($categoryStats as $row) {
    $maxCategoryValue = max($maxCategoryValue, (float) $row['total_value']);
}
?>

<div class="cb-page-head d-print-none">
    <div>
        <h1 class="cb-page-title">Inventory Value Report</h1>
        <p class="cb-page-sub">Value of stock on hand as of <?= date('F j, Y') ?></p>
    </div>
    <button type="button" class="cb-btn cb-btn-outline" onclick="window.print();">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/></svg>
        Print
    </button>
</div>

<?php require ROOT_PATH . '/app/views/reports/_tabs.php'; ?>

<div class="cb-kpi is-value mb-3">
    <div class="cb-kpi-label mb-2">Total Inventory Value</div>
    <div class="cb-kpi-value"><?= peso($totalValue) ?></div>
    <div class="cb-kpi-foot">across <?= count($materials) ?> material<?= count($materials) === 1 ? '' : 's' ?> in the catalog</div>
</div>

<!-- ============ VALUE BY CATEGORY ============ -->
<div class="cb-card mb-3">
    <div class="cb-card-head">
        <div>
            <h2 class="cb-section-title">Value by Category</h2>
            <p class="cb-section-sub">Where the money is tied up</p>
        </div>
    </div>
    <div class="cb-card-body">
        <?php if (empty($categoryStats)): ?>
        <p class="cb-empty-text text-muted mb-0">No categories to show yet.</p>
        <?php else: ?>
        <?php foreach ($categoryStats as $row): ?>
        <?php
            // Bar width as a share of the biggest category, minimum 1% so a
            // very small category is still visible on the chart
            $barPct = $maxCategoryValue > 0
                ? max(1, ((float) $row['total_value'] / $maxCategoryValue) * 100)
                : 0;
        ?>
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span style="font-size:13px;font-weight:600;"><?= htmlspecialchars($row['category']) ?></span>
                <span style="font-size:13px;" class="text-muted">
                    <?= peso($row['total_value']) ?>
                    <span class="cb-health-pct"><?= (int) $row['item_count'] ?> item<?= (int) $row['item_count'] === 1 ? '' : 's' ?></span>
                </span>
            </div>
            <div class="cb-health-bar" style="height:8px;margin-bottom:0;">
                <div class="cb-health-seg" style="width: <?= round($barPct, 1) ?>%; background-color: var(--cb-orange);"></div>
            </div>
        </div>
        <?php endforeach; ?>
        <?php endif; ?>
    </div>
</div>

<!-- ============ VALUE BY MATERIAL ============ -->
<div class="cb-card">
    <div class="cb-card-head">
        <div>
            <h2 class="cb-section-title">Value by Material</h2>
            <p class="cb-section-sub">Highest value first</p>
        </div>
    </div>
    <div class="cb-card-body is-flush">
        <?php if (empty($materials)): ?>
        <div class="cb-empty">
            <div class="cb-empty-title">No materials in the catalog</div>
            <p class="cb-empty-text">Add materials with a cost per unit to see their value here.</p>
        </div>
        <?php else: ?>
        <div class="cb-table-wrap">
        <table class="cb-table">
            <thead>
                <tr>
                    <th>Material</th>
                    <th>Category</th>
                    <th class="cb-num">Stock</th>
                    <th class="cb-num">Cost / Unit</th>
                    <th class="cb-num">Total Value</th>
                    <th class="cb-num">Share</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($materials as $material): ?>
                <?php
                    $lineValue = (float) ($material['total_value'] ?? 0);
                    $share = $totalValue > 0 ? ($lineValue / $totalValue) * 100 : 0;
                ?>
                <tr>
                    <td class="cb-cell-name"><?= htmlspecialchars($material['name']) ?></td>
                    <td><span class="cb-chip"><?= htmlspecialchars($material['category']) ?></span></td>
                    <td class="cb-num">
                        <?= (int) $material['stock_quantity'] ?>
                        <span class="text-muted"><?= htmlspecialchars($material['unit']) ?></span>
                    </td>
                    <td class="cb-num"><?= peso($material['cost_per_unit']) ?></td>
                    <td class="cb-num">
                        <?php if ($material['cost_per_unit'] !== null): ?>
                        <strong><?= peso($lineValue) ?></strong>
                        <?php else: ?>
                        <span class="text-muted">no cost set</span>
                        <?php endif; ?>
                    </td>
                    <td class="cb-num text-muted"><?= $share > 0 ? number_format($share, 1) . '%' : '-' ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php endif; ?>
    </div>
</div>
