<?php
// Shared tab strip for the four report pages.
// Included at the top of each report so the manager can move between them.
$reportRoute = cbCurrentRoute();

$reportTabs = [
    'reports' => 'Inventory Report',
    'reports/lowstock' => 'Low Stock Report',
    'reports/movement' => 'Stock Movement Report',
    'reports/value' => 'Inventory Value Report',
];
?>
<div class="cb-filters mb-3 d-print-none">
    <?php foreach ($reportTabs as $route => $label): ?>
    <a href="<?= BASE_URL . $route ?>"
       class="cb-btn <?= $reportRoute === $route ? 'cb-btn-primary' : 'cb-btn-outline' ?>">
        <?= $label ?>
    </a>
    <?php endforeach; ?>
</div>
