<?php
// Categories overview. Categories live as a text field on each material,
// so this page groups the catalog rather than reading a categories table.
// Clicking a category opens the materials list filtered to it.

$totalItems = 0;
foreach ($categoryStats as $row) {
    $totalItems += (int) $row['item_count'];
}
$isManager = Auth::role() === 'general_manager';
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Categories</h1>
        <p class="cb-page-sub"><?= count($categoryStats) ?> categor<?= count($categoryStats) === 1 ? 'y' : 'ies' ?> covering <?= $totalItems ?> material<?= $totalItems === 1 ? '' : 's' ?></p>
    </div>
    <a href="<?= BASE_URL ?>materials/create" class="cb-btn cb-btn-primary">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
        Add Material
    </a>
</div>

<?php if (empty($categoryStats)): ?>
<div class="cb-card">
    <div class="cb-empty">
        <div class="cb-empty-icon">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M2 2a1 1 0 0 1 1-1h3.5a1 1 0 0 1 .8.4l.9 1.2a1 1 0 0 0 .8.4H13a1 1 0 0 1 1 1v1H2z"/><path d="M1.5 5h13a.5.5 0 0 1 .5.55l-.8 8A1.5 1.5 0 0 1 12.7 15H3.3a1.5 1.5 0 0 1-1.5-1.45l-.8-8A.5.5 0 0 1 1.5 5"/></svg>
        </div>
        <div class="cb-empty-title">No categories yet</div>
        <p class="cb-empty-text">Categories appear here once you add materials to the catalog.</p>
    </div>
</div>
<?php else: ?>

<!-- Card per category, each linking into the filtered materials list -->
<div class="row g-3">
    <?php foreach ($categoryStats as $row): ?>
    <?php
        $needsAttention = (int) $row['out_count'] + (int) $row['low_count'];
        $categoryUrl = BASE_URL . 'materials?category=' . urlencode($row['category']);
    ?>
    <div class="col-12 col-md-6 col-xl-4">
        <a class="cb-card h-100 d-block text-decoration-none" href="<?= $categoryUrl ?>">
            <div class="cb-card-body">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <div class="cb-cell-name" style="font-size:15px;"><?= htmlspecialchars($row['category']) ?></div>
                        <div class="cb-cell-sub"><?= (int) $row['item_count'] ?> material<?= (int) $row['item_count'] === 1 ? '' : 's' ?></div>
                    </div>
                    <span class="cb-kpi-icon">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2 2a1 1 0 0 1 1-1h3.5a1 1 0 0 1 .8.4l.9 1.2a1 1 0 0 0 .8.4H13a1 1 0 0 1 1 1v1H2z"/><path d="M1.5 5h13a.5.5 0 0 1 .5.55l-.8 8A1.5 1.5 0 0 1 12.7 15H3.3a1.5 1.5 0 0 1-1.5-1.45l-.8-8A.5.5 0 0 1 1.5 5"/></svg>
                    </span>
                </div>

                <div class="d-flex gap-4 mb-3">
                    <div>
                        <div class="cb-label">Total Stock</div>
                        <div class="cb-health-num"><?= number_format((int) $row['total_stock']) ?></div>
                    </div>
                    <?php if ($isManager): ?>
                    <div>
                        <div class="cb-label">Value</div>
                        <div class="cb-health-num" style="font-size:17px;"><?= pesoShort($row['total_value']) ?></div>
                    </div>
                    <?php endif; ?>
                </div>

                <!-- Status summary: silent when nothing in the category needs action -->
                <?php if ($needsAttention === 0): ?>
                <span class="cb-badge is-healthy">All Healthy</span>
                <?php else: ?>
                <div class="d-flex gap-2 flex-wrap">
                    <?php if ((int) $row['out_count'] > 0): ?>
                    <span class="cb-badge is-out"><?= (int) $row['out_count'] ?> Out of Stock</span>
                    <?php endif; ?>
                    <?php if ((int) $row['low_count'] > 0): ?>
                    <span class="cb-badge is-low"><?= (int) $row['low_count'] ?> Low Stock</span>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
            </div>
        </a>
    </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>
