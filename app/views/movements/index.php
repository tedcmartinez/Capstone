<?php
// Movement history: every stock-in / stock-out transaction, sortable by column.
$columns = [
    'material_name' => 'Material',
    'type' => 'Movement',
    'quantity' => 'Quantity',
    'movement_date' => 'Date',
    'logged_by_name' => 'Logged By',
];

// Running totals shown in the summary strip above the table
$totalIn = 0;
$totalOut = 0;
foreach ($movements as $m) {
    if ($m['type'] === 'in') {
        $totalIn += (int) $m['quantity'];
    } else {
        $totalOut += (int) $m['quantity'];
    }
}
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Movement History</h1>
        <p class="cb-page-sub"><?= count($movements) ?> movement<?= count($movements) === 1 ? '' : 's' ?> recorded</p>
    </div>
    <div class="d-flex gap-2">
        <a href="<?= BASE_URL ?>movements/stockin" class="cb-btn cb-btn-in">
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1M2 14.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
            Stock In
        </a>
        <a href="<?= BASE_URL ?>movements/stockout" class="cb-btn cb-btn-out">
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
            Stock Out
        </a>
    </div>
</div>

<!-- Quantity totals across everything currently listed -->
<div class="row g-3 mb-3">
    <div class="col-6 col-lg-4">
        <div class="cb-kpi is-value">
            <div class="cb-kpi-top">
                <span class="cb-kpi-label">Total Received</span>
                <span class="cb-kpi-icon">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1M2 14.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
                </span>
            </div>
            <div class="cb-kpi-value">+<?= number_format($totalIn) ?></div>
            <div class="cb-kpi-foot">units stocked in</div>
        </div>
    </div>
    <div class="col-6 col-lg-4">
        <div class="cb-kpi is-out">
            <div class="cb-kpi-top">
                <span class="cb-kpi-label">Total Withdrawn</span>
                <span class="cb-kpi-icon">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
                </span>
            </div>
            <div class="cb-kpi-value">-<?= number_format($totalOut) ?></div>
            <div class="cb-kpi-foot">units stocked out</div>
        </div>
    </div>
    <div class="col-12 col-lg-4">
        <div class="cb-kpi">
            <div class="cb-kpi-top">
                <span class="cb-kpi-label">Net Change</span>
                <span class="cb-kpi-icon">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M0 8a.5.5 0 0 1 .5-.5h15a.5.5 0 0 1 0 1H.5A.5.5 0 0 1 0 8"/></svg>
                </span>
            </div>
            <div class="cb-kpi-value"><?= ($totalIn - $totalOut) >= 0 ? '+' : '' ?><?= number_format($totalIn - $totalOut) ?></div>
            <div class="cb-kpi-foot">units overall</div>
        </div>
    </div>
</div>

<div class="cb-card">
    <div class="cb-card-body is-flush">
        <?php if (empty($movements)): ?>
        <div class="cb-empty">
            <div class="cb-empty-icon">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 .253.434l2.5 1.5a.5.5 0 1 0 .494-.868L8 8.207z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>
            </div>
            <div class="cb-empty-title">No movements logged yet</div>
            <p class="cb-empty-text">Use Stock In or Stock Out to record your first transaction.</p>
        </div>
        <?php else: ?>
        <div class="cb-table-wrap">
        <table class="cb-table">
            <thead>
                <tr>
                    <?php foreach ($columns as $field => $label): ?>
                    <?php
                        $isActive = $sort === $field;
                        $newDir = ($isActive && $direction === 'asc') ? 'desc' : 'asc';
                        $arrow = $isActive ? ($direction === 'asc' ? '&#9650;' : '&#9660;') : '';
                    ?>
                    <th class="<?= $field === 'quantity' ? 'cb-num' : '' ?>">
                        <a class="cb-sort<?= $isActive ? ' is-active' : '' ?>"
                           href="<?= BASE_URL ?>movements?sort=<?= $field ?>&dir=<?= $newDir ?>">
                            <?= $label ?><span class="cb-sort-arrow"><?= $arrow ?></span>
                        </a>
                    </th>
                    <?php endforeach; ?>
                    <th>Notes</th>
                    <th>Receipt</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($movements as $m): ?>
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
                    <td class="text-muted" style="max-width:260px;"><?= htmlspecialchars($m['notes']) ?: '-' ?></td>
                    <td>
                        <?php if (!empty($m['receipt_file'])): ?>
                        <a href="<?= BASE_URL ?>uploads/receipts/<?= htmlspecialchars($m['receipt_file']) ?>"
                           target="_blank" class="cb-btn cb-btn-outline cb-btn-sm">View</a>
                        <?php else: ?>
                        <span class="text-muted">-</span>
                        <?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php endif; ?>
    </div>
</div>
