<?php
// Add new material form.
// cost_per_unit and supplier are only shown to the general manager.
?>
<h3 class="mb-3">Add New Material</h3>

<?php if (!empty($errors)): ?>
<div class="alert alert-danger">
    <ul class="mb-0">
        <?php foreach ($errors as $error): ?><li><?= htmlspecialchars($error) ?></li><?php endforeach; ?>
    </ul>
</div>
<?php endif; ?>

<form method="POST" action="<?= BASE_URL ?>materials/create" novalidate>
    <div class="row">
        <div class="col-md-6 mb-3">
            <label class="form-label">Material Name</label>
            <input type="text" name="name" class="form-control" required value="<?= htmlspecialchars($old['name'] ?? '') ?>">
        </div>
        <div class="col-md-6 mb-3">
            <label class="form-label">Category</label>
            <!-- datalist gives a dropdown of existing categories but still
                 allows typing a completely new category -->
            <input type="text" name="category" list="categoryOptions" class="form-control" required
                   value="<?= htmlspecialchars($old['category'] ?? '') ?>"
                   placeholder="Pick an existing category or type a new one">
            <datalist id="categoryOptions">
                <?php foreach ($categories as $category): ?>
                <option value="<?= htmlspecialchars($category) ?>"></option>
                <?php endforeach; ?>
            </datalist>
        </div>
        <div class="col-md-4 mb-3">
            <label class="form-label">Size</label>
            <input type="text" name="size" class="form-control" value="<?= htmlspecialchars($old['size'] ?? '') ?>">
        </div>
        <div class="col-md-4 mb-3">
            <label class="form-label">Unit</label>
            <input type="text" name="unit" class="form-control" required value="<?= htmlspecialchars($old['unit'] ?? '') ?>" placeholder="pcs, sheet, yard, can">
        </div>
        <div class="col-md-4 mb-3">
            <label class="form-label">Opening Stock Quantity</label>
            <input type="number" min="0" step="1" name="stock_quantity" class="form-control" required value="<?= htmlspecialchars($old['stock_quantity'] ?? '0') ?>">
        </div>

        <?php if (Auth::role() === 'general_manager'): ?>
        <div class="col-md-4 mb-3">
            <label class="form-label">Minimum Threshold</label>
            <input type="number" min="0" step="1" name="min_threshold" class="form-control" required value="<?= htmlspecialchars($old['min_threshold'] ?? '0') ?>">
        </div>
        <div class="col-md-4 mb-3">
            <label class="form-label">Cost per Unit (PHP)</label>
            <input type="number" min="0" step="0.01" name="cost_per_unit" class="form-control" value="<?= htmlspecialchars($old['cost_per_unit'] ?? '') ?>">
        </div>
        <div class="col-md-4 mb-3">
            <label class="form-label">Supplier</label>
            <select name="supplier_id" class="form-select">
                <option value="">-- None --</option>
                <?php foreach ($suppliers as $supplier): ?>
                <option value="<?= $supplier['supplier_id'] ?>" <?= (isset($old['supplier_id']) && $old['supplier_id'] == $supplier['supplier_id']) ? 'selected' : '' ?>>
                    <?= htmlspecialchars($supplier['name']) ?>
                </option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php endif; ?>

        <div class="col-12 mb-3">
            <label class="form-label">Notes</label>
            <textarea name="notes" class="form-control" rows="2"><?= htmlspecialchars($old['notes'] ?? '') ?></textarea>
        </div>
    </div>
    <button type="submit" class="btn btn-success">Save Material</button>
    <a href="<?= BASE_URL ?>materials" class="btn btn-secondary">Cancel</a>
</form>
