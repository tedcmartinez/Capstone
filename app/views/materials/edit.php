<?php
// Edit material form.
// Stock quantity cannot be edited here, it only changes through Stock In / Stock Out.
// min_threshold, cost_per_unit, and supplier are only editable by the general manager.
?>
<h3 class="mb-3">Edit Material</h3>

<?php if (!empty($errors)): ?>
<div class="alert alert-danger">
    <ul class="mb-0">
        <?php foreach ($errors as $error): ?><li><?= htmlspecialchars($error) ?></li><?php endforeach; ?>
    </ul>
</div>
<?php endif; ?>

<form method="POST" action="<?= BASE_URL ?>materials/edit/<?= $material['material_id'] ?>" novalidate>
    <div class="row">
        <div class="col-md-6 mb-3">
            <label class="form-label">Material Name</label>
            <input type="text" name="name" class="form-control" required value="<?= htmlspecialchars($material['name']) ?>">
        </div>
        <div class="col-md-6 mb-3">
            <label class="form-label">Category</label>
            <!-- datalist gives a dropdown of existing categories but still
                 allows typing a completely new category -->
            <input type="text" name="category" list="categoryOptions" class="form-control" required
                   value="<?= htmlspecialchars($material['category']) ?>">
            <datalist id="categoryOptions">
                <?php foreach ($categories as $category): ?>
                <option value="<?= htmlspecialchars($category) ?>"></option>
                <?php endforeach; ?>
            </datalist>
        </div>
        <div class="col-md-4 mb-3">
            <label class="form-label">Size</label>
            <input type="text" name="size" class="form-control" value="<?= htmlspecialchars($material['size']) ?>">
        </div>
        <div class="col-md-4 mb-3">
            <label class="form-label">Unit</label>
            <input type="text" name="unit" class="form-control" required value="<?= htmlspecialchars($material['unit']) ?>">
        </div>
        <div class="col-md-4 mb-3">
            <label class="form-label">Current Stock</label>
            <input type="text" class="form-control" value="<?= (int) $material['stock_quantity'] ?>" disabled>
            <div class="form-text">Only changes through Stock In / Stock Out.</div>
        </div>

        <div class="col-md-4 mb-3">
            <label class="form-label">Minimum Threshold</label>
            <?php if (Auth::role() === 'general_manager'): ?>
            <input type="number" min="0" step="1" name="min_threshold" class="form-control" required value="<?= (int) $material['min_threshold'] ?>">
            <?php else: ?>
            <input type="text" class="form-control" value="<?= (int) $material['min_threshold'] ?>" disabled>
            <div class="form-text">Only the general manager can change this.</div>
            <?php endif; ?>
        </div>

        <?php if (Auth::role() === 'general_manager'): ?>
        <div class="col-md-4 mb-3">
            <label class="form-label">Cost per Unit (PHP)</label>
            <input type="number" min="0" step="0.01" name="cost_per_unit" class="form-control" value="<?= htmlspecialchars($material['cost_per_unit'] ?? '') ?>">
        </div>
        <div class="col-md-6 mb-3">
            <label class="form-label">Supplier</label>
            <select name="supplier_id" class="form-select">
                <option value="">-- None --</option>
                <?php foreach ($suppliers as $supplier): ?>
                <option value="<?= $supplier['supplier_id'] ?>" <?= ((int) ($material['supplier_id'] ?? 0) === (int) $supplier['supplier_id']) ? 'selected' : '' ?>>
                    <?= htmlspecialchars($supplier['name']) ?>
                </option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php endif; ?>

        <div class="col-12 mb-3">
            <label class="form-label">Notes</label>
            <textarea name="notes" class="form-control" rows="2"><?= htmlspecialchars($material['notes'] ?? '') ?></textarea>
        </div>
    </div>
    <button type="submit" class="btn btn-primary">Update Material</button>
    <a href="<?= BASE_URL ?>materials" class="btn btn-secondary">Cancel</a>
</form>
