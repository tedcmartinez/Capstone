<?php
// GM dashboard. Answers five questions in order:
//   What do I have?      -> KPI cards
//   What condition is it in? -> inventory health bar
//   What can I do now?   -> quick actions
//   What recently changed?   -> movement chart and recent movements
//   What needs attention?    -> low stock table

// Health percentages drive the widths of the segmented bar. Guard against
// an empty catalog so we never divide by zero on a fresh install.
$healthTotal = max(1, $totalMaterials);
$healthyPct = round(($healthyCount / $healthTotal) * 100, 1);
$lowPct     = round(($lowOnlyCount / $healthTotal) * 100, 1);
$outPct     = round(($stockOutCount / $healthTotal) * 100, 1);

// ---- Chart geometry ----
// The chart is drawn as plain SVG so the system needs no chart library
// and keeps working offline on the LAN.
$chartW = 720;
$chartH = 200;
$padLeft = 38;   // room for the value labels on the left
$padBottom = 24; // room for the date labels underneath
$plotW = $chartW - $padLeft - 10;
$plotH = $chartH - $padBottom - 8;

// The tallest bar sets the scale. Minimum of 1 avoids a divide by zero
// when there has been no movement at all yet.
$chartMax = 1;
$chartHasData = false;
foreach ($chartSeries as $point) {
    $chartMax = max($chartMax, $point['in'], $point['out']);
    if ($point['in'] > 0 || $point['out'] > 0) {
        $chartHasData = true;
    }
}

$slotW = $plotW / max(1, count($chartSeries));
$barW = min(11, ($slotW - 6) / 2); // two bars per day, side by side

// Show about seven date labels no matter how many days are on the chart,
// so they never overlap each other
$labelEvery = max(1, (int) ceil(count($chartSeries) / 7));
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Dashboard</h1>
        <p class="cb-page-sub">Inventory overview for Cornerblock Trading Inc.</p>
    </div>
    <div class="d-flex gap-2">
        <a href="<?= BASE_URL ?>reports" class="cb-btn cb-btn-outline">
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M4 11H2v3h2zm5-4H7v7h2zm5-5v12h-2V2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/></svg>
            Reports
        </a>
        <a href="<?= BASE_URL ?>materials/create" class="cb-btn cb-btn-primary">
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
            Add Material
        </a>
    </div>
</div>

<!-- ============ KPI CARDS ============ -->
<div class="row g-3 mb-4">
    <div class="col-6 col-xl-3">
        <div class="cb-kpi">
            <div class="cb-kpi-top">
                <span class="cb-kpi-label">Total Materials</span>
                <span class="cb-kpi-icon">
                    <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5 8 5.961 14.154 3.5zM15 4.239l-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923zM7.443.184a1.5 1.5 0 0 1 1.114 0l7.129 2.852A.5.5 0 0 1 16 3.5v8.662a1 1 0 0 1-.629.928l-7.185 2.874a.5.5 0 0 1-.372 0L.63 13.09a1 1 0 0 1-.63-.928V3.5a.5.5 0 0 1 .314-.464z"/></svg>
                </span>
            </div>
            <div class="cb-kpi-value"><?= $totalMaterials ?></div>
            <div class="cb-kpi-foot">items in catalog</div>
        </div>
    </div>

    <div class="col-6 col-xl-3">
        <div class="cb-kpi is-low">
            <div class="cb-kpi-top">
                <span class="cb-kpi-label">Low Stock</span>
                <span class="cb-kpi-icon">
                    <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>
                </span>
            </div>
            <div class="cb-kpi-value <?= $lowOnlyCount > 0 ? 'is-warning' : '' ?>"><?= $lowOnlyCount ?></div>
            <div class="cb-kpi-foot">
                <?= $lowOnlyCount > 0 ? 'need reordering soon' : 'nothing running low' ?>
            </div>
        </div>
    </div>

    <div class="col-6 col-xl-3">
        <div class="cb-kpi is-out">
            <div class="cb-kpi-top">
                <span class="cb-kpi-label">Out of Stock</span>
                <span class="cb-kpi-icon">
                    <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/></svg>
                </span>
            </div>
            <div class="cb-kpi-value <?= $stockOutCount > 0 ? 'is-critical' : '' ?>"><?= $stockOutCount ?></div>
            <div class="cb-kpi-foot">
                <?= $stockOutCount > 0 ? 'urgent, cannot be used' : 'all materials available' ?>
            </div>
        </div>
    </div>

    <div class="col-6 col-xl-3">
        <div class="cb-kpi is-value">
            <div class="cb-kpi-top">
                <span class="cb-kpi-label">Inventory Value</span>
                <span class="cb-kpi-icon">
                    <svg width="17" height="17" fill="currentColor" viewBox="0 0 16 16"><path d="M4 10.781c.148 1.667 1.513 2.85 3.591 3.003V15h1.043v-1.216c2.27-.179 3.678-1.438 3.678-3.3 0-1.59-.947-2.51-2.956-3.028l-.722-.187V3.467c1.122.11 1.879.714 2.06 1.578h1.634c-.128-1.606-1.483-2.774-3.694-2.87V1H7.591v1.199c-1.939.196-3.35 1.437-3.35 3.156 0 1.443.918 2.465 2.795 2.951l.6.156v4.128c-1.157-.170-1.962-.798-2.144-1.809zm3.591-3.05c-1.104-.31-1.7-.863-1.7-1.671 0-.913.671-1.6 1.7-1.771zm1.043 1.943c1.347.374 1.96.914 1.96 1.831 0 1.045-.788 1.766-2.116 1.879V9.674z"/></svg>
                </span>
            </div>
            <div class="cb-kpi-value is-money"><?= pesoShort($inventoryValue) ?></div>
            <div class="cb-kpi-foot">total stock on hand</div>
        </div>
    </div>
</div>

<!-- ============ INVENTORY HEALTH ============ -->
<div class="cb-card mb-4">
    <div class="cb-card-head">
        <div>
            <h2 class="cb-section-title">Inventory Health</h2>
            <p class="cb-section-sub">Condition of all <?= $totalMaterials ?> materials in the catalog</p>
        </div>
        <a href="<?= BASE_URL ?>materials" class="cb-link">View catalog &rsaquo;</a>
    </div>
    <div class="cb-card-body">
        <!-- One bar split into three coloured segments, sized by percentage -->
        <div class="cb-health-bar">
            <?php if ($healthyCount > 0): ?>
            <div class="cb-health-seg is-healthy" style="width: <?= $healthyPct ?>%;" title="Healthy: <?= $healthyCount ?>"></div>
            <?php endif; ?>
            <?php if ($lowOnlyCount > 0): ?>
            <div class="cb-health-seg is-low" style="width: <?= $lowPct ?>%;" title="Low stock: <?= $lowOnlyCount ?>"></div>
            <?php endif; ?>
            <?php if ($stockOutCount > 0): ?>
            <div class="cb-health-seg is-out" style="width: <?= $outPct ?>%;" title="Out of stock: <?= $stockOutCount ?>"></div>
            <?php endif; ?>
        </div>

        <div class="cb-health-legend">
            <a class="cb-health-item text-decoration-none" href="<?= BASE_URL ?>materials?status=healthy">
                <div class="cb-health-key"><span class="cb-health-swatch is-healthy"></span> Healthy / In Stock</div>
                <div class="cb-health-num" style="color: var(--cb-green);">
                    <?= $healthyCount ?><span class="cb-health-pct"><?= $healthyPct ?>%</span>
                </div>
            </a>
            <a class="cb-health-item text-decoration-none" href="<?= BASE_URL ?>materials?status=low">
                <div class="cb-health-key"><span class="cb-health-swatch is-low"></span> Low Stock</div>
                <div class="cb-health-num" style="color: var(--cb-amber);">
                    <?= $lowOnlyCount ?><span class="cb-health-pct"><?= $lowPct ?>%</span>
                </div>
            </a>
            <a class="cb-health-item text-decoration-none" href="<?= BASE_URL ?>materials?status=out">
                <div class="cb-health-key"><span class="cb-health-swatch is-out"></span> Out of Stock</div>
                <div class="cb-health-num" style="color: var(--cb-red);">
                    <?= $stockOutCount ?><span class="cb-health-pct"><?= $outPct ?>%</span>
                </div>
            </a>
        </div>
    </div>
</div>

<!-- ============ QUICK ACTIONS ============ -->
<h2 class="cb-section-title mb-2">Quick Actions</h2>
<div class="row g-3 mb-4">
    <div class="col-6 col-lg-3">
        <a class="cb-quick" href="<?= BASE_URL ?>materials/create">
            <span class="cb-quick-icon">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
            </span>
            Add Material
        </a>
    </div>
    <div class="col-6 col-lg-3">
        <a class="cb-quick" href="<?= BASE_URL ?>movements/stockin">
            <span class="cb-quick-icon is-in">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1M2 14.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
            </span>
            Stock In
        </a>
    </div>
    <div class="col-6 col-lg-3">
        <a class="cb-quick" href="<?= BASE_URL ?>movements/stockout">
            <span class="cb-quick-icon is-out">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
            </span>
            Stock Out
        </a>
    </div>
    <div class="col-6 col-lg-3">
        <a class="cb-quick" href="<?= BASE_URL ?>movements">
            <span class="cb-quick-icon">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.379l.758.653a8 8 0 0 1-.401.432zM8 15a7 7 0 0 0 5-2.09l.707.707A8 8 0 0 1 8 16zM.15 8.008A8 8 0 0 1 8 0v1a7 7 0 0 0-6.85 7z"/><path d="M8 4.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .253.434l2.5 1.5a.5.5 0 1 0 .494-.868L8 8.207z"/></svg>
            </span>
            View Movements
        </a>
    </div>
</div>

<!-- ============ CHART + LOW STOCK ============ -->
<div class="row g-3 mb-4">
    <div class="col-12 col-xl-7">
        <div class="cb-card h-100">
            <div class="cb-card-head">
                <div>
                    <h2 class="cb-section-title">Stock Movements</h2>
                    <p class="cb-section-sub">Quantity moved over the last 30 days</p>
                </div>
                <div class="cb-chart-legend">
                    <span class="cb-chart-key is-in"><span></span> Stock In</span>
                    <span class="cb-chart-key is-out"><span></span> Stock Out</span>
                </div>
            </div>
            <div class="cb-card-body">
                <?php if (!$chartHasData): ?>
                <!-- No movements in the window, so a chart would be an empty
                     grid. Explain it instead of showing blank axes. -->
                <div class="cb-empty">
                    <div class="cb-empty-icon">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M4 11H2v3h2zm5-4H7v7h2zm5-5v12h-2V2zm-2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM6 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm-5 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z"/></svg>
                    </div>
                    <div class="cb-empty-title">No movements in the last 30 days</div>
                    <p class="cb-empty-text">
                        Log a stock in or stock out and it will appear here.
                        <a href="<?= BASE_URL ?>reports/movement" class="cb-link">See the full movement report</a>
                    </p>
                </div>
                <?php else: ?>
                <svg class="cb-chart" viewBox="0 0 <?= $chartW ?> <?= $chartH ?>" preserveAspectRatio="none" role="img"
                     aria-label="Bar chart of stock in and stock out quantities for the last 30 days">
                    <!-- Horizontal grid lines at 0%, 50% and 100% of the scale -->
                    <?php foreach ([0, 0.5, 1] as $tick): ?>
                    <?php $y = 8 + $plotH - ($plotH * $tick); ?>
                    <line class="cb-chart-grid" x1="<?= $padLeft ?>" y1="<?= $y ?>" x2="<?= $chartW - 10 ?>" y2="<?= $y ?>"></line>
                    <text class="cb-chart-axis" x="<?= $padLeft - 6 ?>" y="<?= $y + 3 ?>" text-anchor="end">
                        <?= round($chartMax * $tick) ?>
                    </text>
                    <?php endforeach; ?>

                    <!-- Two bars per day: stock in on the left, stock out on the right -->
                    <?php foreach ($chartSeries as $i => $point): ?>
                    <?php
                        $slotX = $padLeft + ($i * $slotW);
                        $inH = ($point['in'] / $chartMax) * $plotH;
                        $outH = ($point['out'] / $chartMax) * $plotH;
                        $groupX = $slotX + ($slotW - ($barW * 2 + 3)) / 2;
                    ?>
                    <?php if ($point['in'] > 0): ?>
                    <rect class="cb-chart-bar-in" x="<?= round($groupX, 1) ?>" y="<?= round(8 + $plotH - $inH, 1) ?>"
                          width="<?= round($barW, 1) ?>" height="<?= round($inH, 1) ?>" rx="2">
                        <title><?= shortDate($point['date']) ?>: <?= $point['in'] ?> in</title>
                    </rect>
                    <?php endif; ?>
                    <?php if ($point['out'] > 0): ?>
                    <rect class="cb-chart-bar-out" x="<?= round($groupX + $barW + 3, 1) ?>" y="<?= round(8 + $plotH - $outH, 1) ?>"
                          width="<?= round($barW, 1) ?>" height="<?= round($outH, 1) ?>" rx="2">
                        <title><?= shortDate($point['date']) ?>: <?= $point['out'] ?> out</title>
                    </rect>
                    <?php endif; ?>

                    <!-- Spaced-out date labels so they never overlap -->
                    <?php if ($i % $labelEvery === 0): ?>
                    <text class="cb-chart-axis" x="<?= round($slotX + $slotW / 2, 1) ?>" y="<?= $chartH - 6 ?>" text-anchor="middle">
                        <?= date('M j', strtotime($point['date'])) ?>
                    </text>
                    <?php endif; ?>
                    <?php endforeach; ?>
                </svg>
                <?php endif; ?>
            </div>
        </div>
    </div>

    <div class="col-12 col-xl-5">
        <div class="cb-card h-100">
            <div class="cb-card-head">
                <div>
                    <h2 class="cb-section-title">Low Stock Materials</h2>
                    <p class="cb-section-sub">At or below the minimum threshold</p>
                </div>
                <a href="<?= BASE_URL ?>reports/lowstock" class="cb-link">Report &rsaquo;</a>
            </div>
            <div class="cb-card-body is-flush">
                <?php if (empty($lowStockMaterials)): ?>
                <div class="cb-empty">
                    <div class="cb-empty-icon">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>
                    </div>
                    <div class="cb-empty-title">Everything is stocked</div>
                    <p class="cb-empty-text">No materials are below threshold right now.</p>
                </div>
                <?php else: ?>
                <div class="cb-table-wrap">
                    <table class="cb-table">
                        <thead>
                            <tr>
                                <th>Material</th>
                                <th>Stock</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach (array_slice($lowStockMaterials, 0, 6) as $material): ?>
                            <?php $status = stockStatus($material['stock_quantity'], $material['min_threshold']); ?>
                            <tr>
                                <td>
                                    <div class="cb-cell-name"><?= htmlspecialchars($material['name']) ?></div>
                                    <div class="cb-cell-sub"><?= htmlspecialchars($material['category']) ?></div>
                                </td>
                                <td>
                                    <span class="cb-cell-stock"><?= (int) $material['stock_quantity'] ?></span>
                                    <span class="text-muted">/ <?= (int) $material['min_threshold'] ?></span>
                                    <div class="cb-cell-sub"><?= htmlspecialchars($material['unit']) ?></div>
                                </td>
                                <td><span class="cb-badge is-<?= $status ?>"><?= stockStatusLabel($status) ?></span></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <?php if (count($lowStockMaterials) > 6): ?>
                <div class="p-3 border-top">
                    <a href="<?= BASE_URL ?>reports/lowstock" class="cb-link">
                        View all <?= count($lowStockMaterials) ?> low stock materials &rsaquo;
                    </a>
                </div>
                <?php endif; ?>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- ============ RECENT MOVEMENTS ============ -->
<div class="cb-card">
    <div class="cb-card-head">
        <div>
            <h2 class="cb-section-title">Recent Movements</h2>
            <p class="cb-section-sub">Latest stock in and stock out activity</p>
        </div>
        <a href="<?= BASE_URL ?>movements" class="cb-link">View All Movements &rsaquo;</a>
    </div>
    <div class="cb-card-body is-flush">
        <?php if (empty($recentMovements)): ?>
        <div class="cb-empty">
            <div class="cb-empty-icon">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zM8 15a7 7 0 1 0 0-14v14z"/></svg>
            </div>
            <div class="cb-empty-title">No movements yet</div>
            <p class="cb-empty-text">Stock in and stock out activity will appear here.</p>
        </div>
        <?php else: ?>
        <div class="cb-table-wrap">
            <table class="cb-table">
                <thead>
                    <tr>
                        <th>Material</th>
                        <th>Movement</th>
                        <th class="cb-num">Quantity</th>
                        <th>Date</th>
                        <th>Logged By</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($recentMovements as $m): ?>
                    <?php $isIn = $m['type'] === 'in'; ?>
                    <tr>
                        <td class="cb-cell-name"><?= htmlspecialchars($m['material_name']) ?></td>
                        <td>
                            <span class="cb-move <?= $isIn ? 'is-in' : 'is-out' ?>">
                                <?= $isIn ? 'IN' : 'OUT' ?>
                                <span class="cb-move-qty"><?= $isIn ? '+' : '-' ?><?= (int) $m['quantity'] ?></span>
                            </span>
                        </td>
                        <td class="cb-num"><?= (int) $m['quantity'] ?></td>
                        <td class="text-muted"><?= shortDate($m['movement_date']) ?></td>
                        <td><?= htmlspecialchars($m['logged_by_name']) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>
</div>
