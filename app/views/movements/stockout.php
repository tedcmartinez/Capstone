<?php
// Log a stock-out (materials withdrawn for production) transaction.
// Each withdrawal is logged individually and in real time, not as a project batch.
?>
<h3 class="mb-3">Log Stock Out</h3>

<?php if (!empty($errors)): ?>
<div class="alert alert-danger">
    <ul class="mb-0">
        <?php foreach ($errors as $error): ?><li><?= htmlspecialchars($error) ?></li><?php endforeach; ?>
    </ul>
</div>
<?php endif; ?>

<form method="POST" action="<?= BASE_URL ?>movements/stockout" novalidate>
    <div class="mb-3">
        <label class="form-label">Material</label>
        <select name="material_id" class="form-select" required>
            <option value="">-- Select material --</option>
            <?php foreach ($materials as $material): ?>
            <option value="<?= $material['material_id'] ?>"><?= htmlspecialchars($material['name']) ?> (<?= (int) $material['stock_quantity'] ?> <?= htmlspecialchars($material['unit']) ?> in stock)</option>
            <?php endforeach; ?>
        </select>
    </div>
    <div class="mb-3">
        <label class="form-label">Quantity Removed</label>
        <input type="number" name="quantity" min="1" step="1" class="form-control" required>
    </div>
    <div class="mb-3">
        <label class="form-label">Date</label>
        <!-- Display only. The actual date is stamped by the server so it
             cannot be changed or backdated. -->
        <input type="text" class="form-control" value="<?= date('F j, Y') ?>" disabled>
        <div class="form-text">Recorded automatically as today's date.</div>
    </div>
    <div class="mb-3">
        <label class="form-label">Notes</label>
        <textarea name="notes" class="form-control" rows="2"></textarea>
    </div>
    <button type="submit" class="btn btn-warning">Save Stock Out</button>
    <a href="<?= BASE_URL ?>movements" class="btn btn-secondary">Cancel</a>
</form>
