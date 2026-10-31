<?php
// Add new material form.
// cost_per_unit, supplier and min_threshold are only shown to the general
// manager, and the server enforces the same rule when the form is submitted.
$isManager = Auth::role() === 'general_manager';
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Add New Material</h1>
        <p class="cb-page-sub">Add an item to the Cornerblock materials catalog</p>
    </div>
    <a href="<?= BASE_URL ?>materials" class="cb-btn cb-btn-outline">Back to Catalog</a>
</div>

<?php if (!empty($errors)): ?>
<div class="cb-alert is-danger">
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="flex-shrink:0;margin-top:2px;"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5m.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2"/></svg>
    <div>
        <strong>Please check the form</strong>
        <ul class="mt-1">
            <?php foreach ($errors as $error): ?><li><?= htmlspecialchars($error) ?></li><?php endforeach; ?>
        </ul>
    </div>
</div>
<?php endif; ?>

<div class="row">
    <div class="col-12 col-xl-9">
        <form method="POST" action="<?= BASE_URL ?>materials/create" novalidate>

            <!-- ---- Basic details ---- -->
            <div class="cb-card mb-3">
                <div class="cb-card-head">
                    <div>
                        <h2 class="cb-section-title">Material Details</h2>
                        <p class="cb-section-sub">What the item is and how it is measured</p>
                    </div>
                </div>
                <div class="cb-card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="cb-field">
                                <label class="cb-field-label">Material Name</label>
                                <input type="text" name="name" class="cb-input" required
                                       value="<?= htmlspecialchars($old['name'] ?? '') ?>"
                                       placeholder="e.g. Marine Plywood 18mm">
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="cb-field">
                                <label class="cb-field-label">Category</label>
                                <!-- datalist gives a dropdown of existing categories but still
                                     allows typing a completely new category -->
                                <input type="text" name="category" list="categoryOptions" class="cb-input" required
                                       value="<?= htmlspecialchars($old['category'] ?? '') ?>"
                                       placeholder="Pick an existing category or type a new one">
                                <datalist id="categoryOptions">
                                    <?php foreach ($categories as $category): ?>
                                    <option value="<?= htmlspecialchars($category) ?>"></option>
                                    <?php endforeach; ?>
                                </datalist>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="cb-field">
                                <label class="cb-field-label">Size <span class="text-muted">(optional)</span></label>
                                <input type="text" name="size" class="cb-input"
                                       value="<?= htmlspecialchars($old['size'] ?? '') ?>"
                                       placeholder="e.g. 4ft x 8ft">
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="cb-field mb-0">
                                <label class="cb-field-label">Unit</label>
                                <input type="text" name="unit" class="cb-input" required
                                       value="<?= htmlspecialchars($old['unit'] ?? '') ?>"
                                       placeholder="pcs, sheet, yard, can">
                                <div class="cb-help">How this material is counted.</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ---- Stock levels ---- -->
            <div class="cb-card mb-3">
                <div class="cb-card-head">
                    <div>
                        <h2 class="cb-section-title">Stock Levels</h2>
                        <p class="cb-section-sub">Opening quantity and when to reorder</p>
                    </div>
                </div>
                <div class="cb-card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="cb-field <?= $isManager ? '' : 'mb-0' ?>">
                                <label class="cb-field-label">Opening Stock Quantity</label>
                                <input type="number" min="0" step="1" name="stock_quantity" class="cb-input" required
                                       value="<?= htmlspecialchars($old['stock_quantity'] ?? '0') ?>">
                                <div class="cb-help">After this, stock only changes through Stock In / Stock Out.</div>
                            </div>
                        </div>
                        <?php if ($isManager): ?>
                        <div class="col-md-6">
                            <div class="cb-field mb-0">
                                <label class="cb-field-label">Minimum Threshold</label>
                                <input type="number" min="0" step="1" name="min_threshold" class="cb-input" required
                                       value="<?= htmlspecialchars($old['min_threshold'] ?? '0') ?>">
                                <div class="cb-help">An email alert is sent when stock reaches this level.</div>
                            </div>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <?php if ($isManager): ?>
            <!-- ---- Purchasing, general manager only ---- -->
            <div class="cb-card mb-3">
                <div class="cb-card-head">
                    <div>
                        <h2 class="cb-section-title">Purchasing</h2>
                        <p class="cb-section-sub">Cost and supplier, visible to the manager only</p>
                    </div>
                </div>
                <div class="cb-card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="cb-field mb-0">
                                <label class="cb-field-label">Cost per Unit (PHP) <span class="text-muted">(optional)</span></label>
                                <input type="number" min="0" step="0.01" name="cost_per_unit" class="cb-input"
                                       value="<?= htmlspecialchars($old['cost_per_unit'] ?? '') ?>">
                                <div class="cb-help">Used to work out the total inventory value.</div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="cb-field mb-0">
                                <label class="cb-field-label">Supplier <span class="text-muted">(optional)</span></label>
                                <select name="supplier_id" class="cb-select">
                                    <option value="">-- None --</option>
                                    <?php foreach ($suppliers as $supplier): ?>
                                    <option value="<?= $supplier['supplier_id'] ?>" <?= (isset($old['supplier_id']) && $old['supplier_id'] == $supplier['supplier_id']) ? 'selected' : '' ?>>
                                        <?= htmlspecialchars($supplier['name']) ?>
                                    </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <?php endif; ?>

            <!-- ---- Notes ---- -->
            <div class="cb-card mb-3">
                <div class="cb-card-body">
                    <div class="cb-field mb-0">
                        <label class="cb-field-label">Notes <span class="text-muted">(optional)</span></label>
                        <textarea name="notes" class="cb-textarea" rows="3"><?= htmlspecialchars($old['notes'] ?? '') ?></textarea>
                    </div>
                </div>
            </div>

            <div class="d-flex gap-2">
                <button type="submit" class="cb-btn cb-btn-primary">Save Material</button>
                <a href="<?= BASE_URL ?>materials" class="cb-btn cb-btn-outline">Cancel</a>
            </div>
        </form>
    </div>
</div>
