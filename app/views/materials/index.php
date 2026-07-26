<?php
// Materials catalog: searchable table of all materials.
// Editing happens in a Bootstrap modal per row (no separate page).
// cost_per_unit and supplier are only shown to the general manager.
?>
<div class="d-flex justify-content-between align-items-center mb-3">
    <h3>Materials Catalog</h3>
    <a href="<?= BASE_URL ?>materials/create" class="btn btn-success">+ Add Material</a>
</div>

<form method="GET" action="<?= BASE_URL ?>materials" class="row g-2 mb-3">
    <div class="col-auto">
        <input type="text" name="q" class="form-control" placeholder="Search by name or category"
               value="<?= htmlspecialchars($keyword) ?>">
    </div>
    <div class="col-auto">
        <button type="submit" class="btn btn-outline-secondary">Search</button>
    </div>
</form>

<!-- Existing categories offered in every edit modal, new ones can still be typed -->
<datalist id="categoryOptions">
    <?php foreach ($categories as $category): ?>
    <option value="<?= htmlspecialchars($category) ?>"></option>
    <?php endforeach; ?>
</datalist>

<div class="table-responsive">
<table class="table table-bordered table-hover align-middle">
    <thead class="table-dark">
        <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Size</th>
            <th>Unit</th>
            <th>Stock</th>
            <th>Min Threshold</th>
            <?php if (Auth::role() === 'general_manager'): ?>
            <th>Cost / Unit</th>
            <th>Supplier</th>
            <?php endif; ?>
            <th>Actions</th>
        </tr>
    </thead>
    <tbody>
        <?php if (empty($materials)): ?>
        <tr><td colspan="9" class="text-center text-muted">No materials found.</td></tr>
        <?php endif; ?>
        <?php foreach ($materials as $material): ?>
        <tr class="<?= $material['stock_quantity'] <= $material['min_threshold'] ? 'table-danger' : '' ?>">
            <td><?= htmlspecialchars($material['name']) ?></td>
            <td><?= htmlspecialchars($material['category']) ?></td>
            <td><?= htmlspecialchars($material['size']) ?></td>
            <td><?= htmlspecialchars($material['unit']) ?></td>
            <td><?= (int) $material['stock_quantity'] ?></td>
            <td><?= (int) $material['min_threshold'] ?></td>
            <?php if (Auth::role() === 'general_manager'): ?>
            <td><?= $material['cost_per_unit'] !== null ? 'PHP ' . number_format((float) $material['cost_per_unit'], 2) : '-' ?></td>
            <td><?= htmlspecialchars($material['supplier_name'] ?? '-') ?></td>
            <?php endif; ?>
            <td class="text-nowrap">
                <!-- Quick stock logging: opens a modal with this material preselected -->
                <button type="button" class="btn btn-sm btn-success" data-bs-toggle="modal"
                        data-bs-target="#stockinModal<?= $material['material_id'] ?>">Stock In</button>
                <button type="button" class="btn btn-sm btn-warning" data-bs-toggle="modal"
                        data-bs-target="#stockoutModal<?= $material['material_id'] ?>"
                        <?= (int) $material['stock_quantity'] === 0 ? 'disabled' : '' ?>>Stock Out</button>
                <?php if (Auth::role() === 'general_manager'): ?>
                <!-- Edit and Delete are general manager only actions -->
                <button type="button" class="btn btn-sm btn-primary" data-bs-toggle="modal"
                        data-bs-target="#editModal<?= $material['material_id'] ?>">Edit</button>
                <form method="POST" action="<?= BASE_URL ?>materials/delete/<?= $material['material_id'] ?>" class="d-inline"
                      onsubmit="return confirm('Delete this material? This cannot be undone.');">
                    <button type="submit" class="btn btn-sm btn-danger">Delete</button>
                </form>
                <?php endif; ?>
            </td>
        </tr>
        <?php endforeach; ?>
    </tbody>
</table>
</div>

<?php foreach ($materials as $material): ?>
<!-- Stock In modal: logs incoming stock for this material.
     Submits to the same movements/stockin endpoint as the full page,
     so validation and stock math are unchanged. -->
<div class="modal fade" id="stockinModal<?= $material['material_id'] ?>" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <form method="POST" action="<?= BASE_URL ?>movements/stockin" enctype="multipart/form-data" novalidate>
                <input type="hidden" name="material_id" value="<?= $material['material_id'] ?>">
                <div class="modal-header">
                    <h5 class="modal-title">Stock In: <?= htmlspecialchars($material['name']) ?></h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p class="text-muted mb-3">Current stock: <?= (int) $material['stock_quantity'] ?> <?= htmlspecialchars($material['unit']) ?></p>
                    <div class="mb-3">
                        <label class="form-label">Quantity Received</label>
                        <input type="number" name="quantity" min="1" step="1" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Notes</label>
                        <textarea name="notes" class="form-control" rows="2"></textarea>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Receipt Photo (optional)</label>
                        <input type="file" name="receipt" class="form-control" accept="image/jpeg,image/png,image/webp">
                        <div class="form-text">JPG, PNG, or WEBP image, up to 5 MB.</div>
                    </div>
                    <div class="form-text">Date is recorded automatically as today.</div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-success">Save Stock In</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Stock Out modal: logs a withdrawal for this material.
     Submits to movements/stockout, which also runs the low-stock
     email alert check after saving. -->
<div class="modal fade" id="stockoutModal<?= $material['material_id'] ?>" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <form method="POST" action="<?= BASE_URL ?>movements/stockout" novalidate>
                <input type="hidden" name="material_id" value="<?= $material['material_id'] ?>">
                <div class="modal-header">
                    <h5 class="modal-title">Stock Out: <?= htmlspecialchars($material['name']) ?></h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p class="text-muted mb-3">Current stock: <?= (int) $material['stock_quantity'] ?> <?= htmlspecialchars($material['unit']) ?></p>
                    <div class="mb-3">
                        <label class="form-label">Quantity Removed</label>
                        <input type="number" name="quantity" min="1" max="<?= (int) $material['stock_quantity'] ?>" step="1" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Notes</label>
                        <textarea name="notes" class="form-control" rows="2"></textarea>
                    </div>
                    <div class="form-text">Date is recorded automatically as today.</div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-warning">Save Stock Out</button>
                </div>
            </form>
        </div>
    </div>
</div>
<?php endforeach; ?>

<?php if (Auth::role() === 'general_manager'): ?>
<?php foreach ($materials as $material): ?>
<!-- Edit modal for <?= htmlspecialchars($material['name']) ?>.
     General manager only. Submits to the materials/edit endpoint,
     so all server-side validation and role rules still apply. -->
<div class="modal fade" id="editModal<?= $material['material_id'] ?>" tabindex="-1">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <form method="POST" action="<?= BASE_URL ?>materials/edit/<?= $material['material_id'] ?>" novalidate>
                <div class="modal-header">
                    <h5 class="modal-title">Edit: <?= htmlspecialchars($material['name']) ?></h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label">Material Name</label>
                            <input type="text" name="name" class="form-control" required
                                   value="<?= htmlspecialchars($material['name']) ?>">
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label">Category</label>
                            <input type="text" name="category" list="categoryOptions" class="form-control" required
                                   value="<?= htmlspecialchars($material['category']) ?>">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Size</label>
                            <input type="text" name="size" class="form-control"
                                   value="<?= htmlspecialchars($material['size']) ?>">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Unit</label>
                            <input type="text" name="unit" class="form-control" required
                                   value="<?= htmlspecialchars($material['unit']) ?>">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Current Stock</label>
                            <input type="text" class="form-control"
                                   value="<?= (int) $material['stock_quantity'] ?>" disabled>
                            <div class="form-text">Only changes through Stock In / Stock Out.</div>
                        </div>

                        <div class="col-md-4 mb-3">
                            <label class="form-label">Minimum Threshold</label>
                            <?php if (Auth::role() === 'general_manager'): ?>
                            <input type="number" min="0" step="1" name="min_threshold" class="form-control" required
                                   value="<?= (int) $material['min_threshold'] ?>">
                            <?php else: ?>
                            <input type="text" class="form-control" value="<?= (int) $material['min_threshold'] ?>" disabled>
                            <div class="form-text">Only the general manager can change this.</div>
                            <?php endif; ?>
                        </div>

                        <?php if (Auth::role() === 'general_manager'): ?>
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Cost per Unit (PHP)</label>
                            <input type="number" min="0" step="0.01" name="cost_per_unit" class="form-control"
                                   value="<?= htmlspecialchars($material['cost_per_unit'] ?? '') ?>">
                        </div>
                        <div class="col-md-4 mb-3">
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

                        <div class="col-12">
                            <label class="form-label">Notes</label>
                            <textarea name="notes" class="form-control" rows="2"><?= htmlspecialchars($material['notes'] ?? '') ?></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>
<?php endforeach; ?>
<?php endif; ?>
