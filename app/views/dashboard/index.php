<?php
// GM dashboard: summary counts, low-stock highlights, and recent activity
?>
<h3 class="mb-4">Dashboard</h3>

<div class="row mb-4">
    <div class="col-md-4">
        <div class="card cb-card-total mb-3">
            <div class="card-body">
                <h6 class="card-title">Total Materials</h6>
                <p class="display-6 mb-0"><?= $totalMaterials ?></p>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card cb-card-low mb-3">
            <div class="card-body">
                <h6 class="card-title">Low-Stock Materials</h6>
                <p class="display-6 mb-0"><?= $lowStockCount ?></p>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card cb-card-out mb-3">
            <div class="card-body">
                <h6 class="card-title">Out-of-Stock Materials</h6>
                <p class="display-6 mb-0"><?= $stockOutCount ?></p>
            </div>
        </div>
    </div>
</div>

<h5>Low-Stock Materials</h5>
<table class="table table-bordered table-sm mb-4">
    <thead class="table-dark">
        <tr><th>Name</th><th>Category</th><th>Stock</th><th>Min Threshold</th><th>Unit</th></tr>
    </thead>
    <tbody>
        <?php if (empty($lowStockMaterials)): ?>
        <tr><td colspan="5" class="text-center text-muted">No materials are below threshold right now.</td></tr>
        <?php endif; ?>
        <?php foreach ($lowStockMaterials as $material): ?>
        <tr class="table-danger">
            <td><?= htmlspecialchars($material['name']) ?></td>
            <td><?= htmlspecialchars($material['category']) ?></td>
            <td><?= (int) $material['stock_quantity'] ?></td>
            <td><?= (int) $material['min_threshold'] ?></td>
            <td><?= htmlspecialchars($material['unit']) ?></td>
        </tr>
        <?php endforeach; ?>
    </tbody>
</table>

<h5>Recent Movements</h5>
<table class="table table-bordered table-sm">
    <thead class="table-dark">
        <tr><th>Material</th><th>Type</th><th>Quantity</th><th>Date</th><th>Logged By</th></tr>
    </thead>
    <tbody>
        <?php if (empty($recentMovements)): ?>
        <tr><td colspan="5" class="text-center text-muted">No movements logged yet.</td></tr>
        <?php endif; ?>
        <?php foreach ($recentMovements as $m): ?>
        <tr>
            <td><?= htmlspecialchars($m['material_name']) ?></td>
            <td><span class="badge <?= $m['type'] === 'in' ? 'bg-success' : 'bg-warning text-dark' ?>"><?= strtoupper($m['type']) ?></span></td>
            <td><?= (int) $m['quantity'] ?></td>
            <td><?= htmlspecialchars($m['movement_date']) ?></td>
            <td><?= htmlspecialchars($m['logged_by_name']) ?></td>
        </tr>
        <?php endforeach; ?>
    </tbody>
</table>
