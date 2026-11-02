<?php
// Stock movement report: every movement inside a chosen date range,
// optionally narrowed to one material or one direction.
?>

<div class="cb-page-head d-print-none">
    <div>
        <h1 class="cb-page-title">Stock Movement Report</h1>
        <p class="cb-page-sub"><?= shortDate($dateFrom) ?> to <?= shortDate($dateTo) ?></p>
    </div>
    <button type="button" class="cb-btn cb-btn-outline" onclick="window.print();">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/></svg>
        Print
    </button>
</div>

<?php require ROOT_PATH . '/app/views/reports/_tabs.php'; ?>

<!-- Date range and narrowing filters -->
<form method="GET" action="<?= BASE_URL ?>reports/movement" class="cb-filters mb-3 d-print-none">
    <div>
        <label class="cb-label d-block mb-1">From</label>
        <input type="date" name="from" class="cb-input" value="<?= htmlspecialchars($dateFrom) ?>">
    </div>
    <div>
        <label class="cb-label d-block mb-1">To</label>
        <input type="date" name="to" class="cb-input" value="<?= htmlspecialchars($dateTo) ?>">
    </div>
    <div>
        <label class="cb-label d-block mb-1">Type</label>
        <select name="type" class="cb-select">
            <option value="">All Movements</option>
            <option value="in" <?= $type === 'in' ? 'selected' : '' ?>>Stock In Only</option>
            <option value="out" <?= $type === 'out' ? 'selected' : '' ?>>Stock Out Only</option>
        </select>
    </div>
    <div>
        <label class="cb-label d-block mb-1">Material</label>
        <select name="material" class="cb-select">
            <option value="">All Materials</option>
            <?php foreach ($materials as $material): ?>
            <option value="<?= $material['material_id'] ?>" <?= (string) $materialId === (string) $material['material_id'] ? 'selected' : '' ?>>
                <?= htmlspecialchars($material['name']) ?>
            </option>
            <?php endforeach; ?>
        </select>
    </div>
    <div class="align-self-end">
        <button type="submit" class="cb-btn cb-btn-primary">Apply</button>
    </div>
</form>

<div class="row g-3 mb-3">
    <div class="col-4">
        <div class="cb-kpi is-value">
            <div class="cb-kpi-label mb-2">Stock In</div>
            <div class="cb-kpi-value">+<?= number_format($totalIn) ?></div>
            <div class="cb-kpi-foot">units received</div>
        </div>
    </div>
    <div class="col-4">
        <div class="cb-kpi is-out">
            <div class="cb-kpi-label mb-2">Stock Out</div>
            <div class="cb-kpi-value">-<?= number_format($totalOut) ?></div>
            <div class="cb-kpi-foot">units withdrawn</div>
        </div>
    </div>
    <div class="col-4">
        <div class="cb-kpi">
            <div class="cb-kpi-label mb-2">Net Change</div>
            <div class="cb-kpi-value"><?= ($totalIn - $totalOut) >= 0 ? '+' : '' ?><?= number_format($totalIn - $totalOut) ?></div>
            <div class="cb-kpi-foot"><?= count($movements) ?> movement<?= count($movements) === 1 ? '' : 's' ?></div>
        </div>
    </div>
</div>

<div class="cb-card">
    <div class="cb-card-body is-flush">
        <?php if (empty($movements)): ?>
        <div class="cb-empty">
            <div class="cb-empty-title">No movements in this range</div>
            <p class="cb-empty-text">Try widening the date range or clearing the filters.</p>
        </div>
        <?php else: ?>
        <div class="cb-table-wrap">
        <table class="cb-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Material</th>
                    <th>Category</th>
                    <th>Movement</th>
                    <th class="cb-num">Quantity</th>
                    <th>Logged By</th>
                    <th>Notes</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($movements as $m): ?>
                <?php $isIn = $m['type'] === 'in'; ?>
                <tr>
                    <td class="text-muted"><?= shortDate($m['movement_date']) ?></td>
                    <td class="cb-cell-name"><?= htmlspecialchars($m['material_name']) ?></td>
                    <td><span class="cb-chip"><?= htmlspecialchars($m['category']) ?></span></td>
                    <td>
                        <span class="cb-move <?= $isIn ? 'is-in' : 'is-out' ?>">
                            <?= $isIn ? 'IN' : 'OUT' ?>
                            <span class="cb-move-qty"><?= $isIn ? '+' : '-' ?><?= (int) $m['quantity'] ?></span>
                        </span>
                    </td>
                    <td class="cb-num">
                        <?= (int) $m['quantity'] ?> <span class="text-muted"><?= htmlspecialchars($m['unit']) ?></span>
                    </td>
                    <td><?= htmlspecialchars($m['logged_by_name']) ?></td>
                    <td class="text-muted" style="max-width:240px;"><?= htmlspecialchars($m['notes']) ?: '-' ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php endif; ?>
    </div>
</div>
