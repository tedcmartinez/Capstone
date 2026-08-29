<?php
// Full inventory report: every material with its stock, status and value,
// filterable by category, stock status and supplier. Printable.
$hasFilters = $category !== '' || $status !== '' || $supplierId !== '';
?>

<div class="cb-page-head d-print-none">
    <div>
        <h1 class="cb-page-title">Inventory Report</h1>
        <p class="cb-page-sub">Complete stock position as of <?= date('F j, Y') ?></p>
    </div>
    <button type="button" class="cb-btn cb-btn-outline" onclick="window.print();">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/></svg>
        Print Report
    </button>
</div>

<!-- ============ REPORT NAVIGATION ============ -->
<?php require ROOT_PATH . '/app/views/reports/_tabs.php'; ?>

<!-- ============ FILTERS ============ -->
<form method="GET" action="<?= BASE_URL ?>reports" class="cb-filters mb-3 d-print-none">
    <select name="category" class="cb-select" data-auto-submit>
        <option value="">All Categories</option>
        <?php foreach ($categories as $cat): ?>
        <option value="<?= htmlspecialchars($cat) ?>" <?= $category === $cat ? 'selected' : '' ?>><?= htmlspecialchars($cat) ?></option>
        <?php endforeach; ?>
    </select>

    <select name="status" class="cb-select" data-auto-submit>
        <option value="">All Stock Status</option>
        <option value="healthy" <?= $status === 'healthy' ? 'selected' : '' ?>>Healthy</option>
        <option value="low" <?= $status === 'low' ? 'selected' : '' ?>>Low Stock</option>
        <option value="out" <?= $status === 'out' ? 'selected' : '' ?>>Out of Stock</option>
    </select>

    <select name="supplier" class="cb-select" data-auto-submit>
        <option value="">All Suppliers</option>
        <?php foreach ($suppliers as $supplier): ?>
        <option value="<?= $supplier['supplier_id'] ?>" <?= (string) $supplierId === (string) $supplier['supplier_id'] ? 'selected' : '' ?>>
            <?= htmlspecialchars($supplier['name']) ?>
        </option>
        <?php endforeach; ?>
    </select>

    <?php if ($hasFilters): ?>
    <a href="<?= BASE_URL ?>reports" class="cb-btn cb-btn-outline">Clear Filters</a>
    <?php endif; ?>
</form>

<!-- ============ SUMMARY ============ -->
<div class="row g-3 mb-3">
    <div class="col-4">
        <div class="cb-kpi">
            <div class="cb-kpi-label mb-2">Materials Listed</div>
            <div class="cb-kpi-value"><?= count($materials) ?></div>
        </div>
    </div>
    <div class="col-4">
        <div class="cb-kpi">
            <div class="cb-kpi-label mb-2">Total Units</div>
            <div class="cb-kpi-value"><?= number_format($totalUnits) ?></div>
        </div>
    </div>
    <div class="col-4">
        <div class="cb-kpi is-value">
            <div class="cb-kpi-label mb-2">Total Value</div>
            <div class="cb-kpi-value is-money"><?= pesoShort($totalValue) ?></div>
        </div>
    </div>
</div>

<div class="cb-card">
    <div class="cb-card-body is-flush">
        <?php if (empty($materials)): ?>
        <div class="cb-empty">
            <div class="cb-empty-title">No materials match these filters</div>
            <p class="cb-empty-text">Try clearing the filters above.</p>
        </div>
        <?php else: ?>
        <div class="cb-table-wrap">
        <table class="cb-table">
            <thead>
                <tr>
                    <th>Material</th>
                    <th>Category</th>
                    <th>Size</th>
                    <th class="cb-num">Stock</th>
                    <th class="cb-num">Threshold</th>
                    <th>Status</th>
                    <th class="cb-num">Cost / Unit</th>
                    <th class="cb-num">Total Value</th>
                    <th>Supplier</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($materials as $material): ?>
                <?php
                    $st = stockStatus($material['stock_quantity'], $material['min_threshold']);
                    $lineValue = (float) $material['stock_quantity'] * (float) ($material['cost_per_unit'] ?? 0);
                ?>
                <tr>
                    <td class="cb-cell-name"><?= htmlspecialchars($material['name']) ?></td>
                    <td><span class="cb-chip"><?= htmlspecialchars($material['category']) ?></span></td>
                    <td class="text-muted"><?= htmlspecialchars($material['size']) ?: '-' ?></td>
                    <td class="cb-num">
                        <strong><?= (int) $material['stock_quantity'] ?></strong>
                        <span class="text-muted"><?= htmlspecialchars($material['unit']) ?></span>
                    </td>
                    <td class="cb-num text-muted"><?= (int) $material['min_threshold'] ?></td>
                    <td><span class="cb-badge is-<?= $st ?>"><?= stockStatusLabel($st) ?></span></td>
                    <td class="cb-num"><?= peso($material['cost_per_unit']) ?></td>
                    <td class="cb-num"><?= $material['cost_per_unit'] !== null ? peso($lineValue) : '-' ?></td>
                    <td class="text-muted"><?= htmlspecialchars($material['supplier_name'] ?? '-') ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php endif; ?>
    </div>
</div>
