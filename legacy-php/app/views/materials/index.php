<?php
// Materials catalog: searchable, filterable, sortable table of all materials.
// Stock In / Stock Out / Edit all happen in modals per row, so the user never
// loses their place in the list.
// cost_per_unit and supplier are only shown to the general manager.

$isManager = Auth::role() === 'general_manager';

// Builds a link for a sortable column header. Clicking the column that is
// already sorted flips the direction between ascending and descending.
function sortLink(string $field, string $label, string $sort, string $direction): string
{
    $isActive = $sort === $field;
    $nextDir = ($isActive && $direction === 'asc') ? 'desc' : 'asc';

    // Keep the current search and filters when re-sorting
    $query = $_GET;
    $query['sort'] = $field;
    $query['dir'] = $nextDir;

    $arrow = '';
    if ($isActive) {
        $arrow = '<span class="cb-sort-arrow">' . ($direction === 'asc' ? '&#9650;' : '&#9660;') . '</span>';
    }

    return '<a class="cb-sort' . ($isActive ? ' is-active' : '') . '" href="'
        . BASE_URL . 'materials?' . htmlspecialchars(http_build_query($query)) . '">'
        . htmlspecialchars($label) . $arrow . '</a>';
}

// True when any filter is on, used to show the "Clear" button
$hasFilters = $keyword !== '' || $category !== '' || $status !== '' || $supplierId !== '';
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Materials Catalog</h1>
        <p class="cb-page-sub"><?= count($materials) ?> material<?= count($materials) === 1 ? '' : 's' ?><?= $hasFilters ? ' matching your filters' : ' in the catalog' ?></p>
    </div>
    <a href="<?= BASE_URL ?>materials/create" class="cb-btn cb-btn-primary">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/></svg>
        Add Material
    </a>
</div>

<!-- ============ SEARCH AND FILTERS ============ -->
<!-- One GET form: the search box submits on Enter, the dropdowns submit
     as soon as they change (handled by data-auto-submit in app.js). -->
<form method="GET" action="<?= BASE_URL ?>materials" class="cb-filters mb-3">
    <!-- Sorting is carried along so filtering does not reset the column order -->
    <input type="hidden" name="sort" value="<?= htmlspecialchars($sort) ?>">
    <input type="hidden" name="dir" value="<?= htmlspecialchars($direction) ?>">

    <div class="cb-search">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.44.27.98.68 3.106 3.106 3.106 3.106l1.514-1.514s-2.07-2.07-3.106-3.106a1 1 0 0 0-.68-.98zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/></svg>
        <input type="search" name="q" class="cb-input" placeholder="Search materials..."
               value="<?= htmlspecialchars($keyword) ?>">
    </div>

    <select name="category" class="cb-select" data-auto-submit>
        <option value="">All Categories</option>
        <?php foreach ($categories as $cat): ?>
        <option value="<?= htmlspecialchars($cat) ?>" <?= $category === $cat ? 'selected' : '' ?>>
            <?= htmlspecialchars($cat) ?>
        </option>
        <?php endforeach; ?>
    </select>

    <select name="status" class="cb-select" data-auto-submit>
        <option value="">All Stock Status</option>
        <option value="healthy" <?= $status === 'healthy' ? 'selected' : '' ?>>Healthy</option>
        <option value="low" <?= $status === 'low' ? 'selected' : '' ?>>Low Stock</option>
        <option value="out" <?= $status === 'out' ? 'selected' : '' ?>>Out of Stock</option>
    </select>

    <?php if ($isManager): ?>
    <select name="supplier" class="cb-select" data-auto-submit>
        <option value="">All Suppliers</option>
        <?php foreach ($suppliers as $supplier): ?>
        <option value="<?= $supplier['supplier_id'] ?>" <?= (string) $supplierId === (string) $supplier['supplier_id'] ? 'selected' : '' ?>>
            <?= htmlspecialchars($supplier['name']) ?>
        </option>
        <?php endforeach; ?>
    </select>
    <?php endif; ?>

    <button type="submit" class="cb-btn cb-btn-outline">Search</button>
    <?php if ($hasFilters): ?>
    <a href="<?= BASE_URL ?>materials" class="cb-btn cb-btn-outline">Clear</a>
    <?php endif; ?>
</form>

<!-- Existing categories offered in every edit modal, new ones can still be typed -->
<datalist id="categoryOptions">
    <?php foreach ($categories as $cat): ?>
    <option value="<?= htmlspecialchars($cat) ?>"></option>
    <?php endforeach; ?>
</datalist>

<!-- ============ MATERIALS TABLE ============ -->
<div class="cb-card">
    <div class="cb-card-body is-flush">
        <?php if (empty($materials)): ?>
        <div class="cb-empty">
            <div class="cb-empty-icon">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.44.27.98.68 3.106 3.106 3.106 3.106l1.514-1.514s-2.07-2.07-3.106-3.106a1 1 0 0 0-.68-.98zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/></svg>
            </div>
            <div class="cb-empty-title">No materials found</div>
            <p class="cb-empty-text">
                <?= $hasFilters ? 'Try changing or clearing the filters above.' : 'Add your first material to start tracking inventory.' ?>
            </p>
        </div>
        <?php else: ?>
        <div class="cb-table-wrap">
        <table class="cb-table">
            <thead>
                <tr>
                    <th><?= sortLink('name', 'Name', $sort, $direction) ?></th>
                    <th><?= sortLink('category', 'Category', $sort, $direction) ?></th>
                    <th>Size</th>
                    <th>Unit</th>
                    <th><?= sortLink('stock', 'Stock', $sort, $direction) ?></th>
                    <th class="cb-num">Min Threshold</th>
                    <?php if ($isManager): ?>
                    <th class="cb-num"><?= sortLink('cost', 'Cost / Unit', $sort, $direction) ?></th>
                    <th><?= sortLink('supplier', 'Supplier', $sort, $direction) ?></th>
                    <?php endif; ?>
                    <th class="cb-num">Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($materials as $material): ?>
                <?php
                    $id = $material['material_id'];
                    $stock = (int) $material['stock_quantity'];
                    $status_ = stockStatus($stock, $material['min_threshold']);
                    $isEmpty = $stock === 0;
                ?>
                <tr>
                    <td>
                        <div class="cb-cell-name"><?= htmlspecialchars($material['name']) ?></div>
                    </td>
                    <td><span class="cb-chip"><?= htmlspecialchars($material['category']) ?></span></td>
                    <td class="text-muted"><?= htmlspecialchars($material['size']) ?: '-' ?></td>
                    <td class="text-muted"><?= htmlspecialchars($material['unit']) ?></td>
                    <td>
                        <!-- Stock number sits above its status badge so the
                             condition is readable without comparing columns -->
                        <div class="cb-cell-stock"><?= $stock ?></div>
                        <span class="cb-badge is-<?= $status_ ?>"><?= stockStatusLabel($status_) ?></span>
                    </td>
                    <td class="cb-num text-muted"><?= (int) $material['min_threshold'] ?></td>
                    <?php if ($isManager): ?>
                    <td class="cb-num"><?= peso($material['cost_per_unit']) ?></td>
                    <td class="text-muted"><?= htmlspecialchars($material['supplier_name'] ?? '-') ?></td>
                    <?php endif; ?>
                    <td>
                        <div class="cb-row-actions">
                            <!-- Primary quick action: logging stock in is the
                                 most common job on the production floor -->
                            <button type="button" class="cb-btn cb-btn-outline cb-btn-sm" data-bs-toggle="modal"
                                    data-bs-target="#stockinModal<?= $id ?>">Stock In</button>

                            <!-- Everything else sits in a compact menu -->
                            <div class="dropdown">
                                <button class="cb-dots" type="button" data-bs-toggle="dropdown" aria-label="More actions">
                                    <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/></svg>
                                </button>
                                <div class="dropdown-menu dropdown-menu-end cb-dropdown">
                                    <button type="button" class="dropdown-item" data-bs-toggle="modal"
                                            data-bs-target="#stockinModal<?= $id ?>">
                                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1M2 14.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
                                        Stock In
                                    </button>
                                    <?php if ($isEmpty): ?>
                                    <!-- Nothing left to remove, so Stock Out is disabled -->
                                    <span class="dropdown-item disabled text-muted" title="No stock available">
                                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
                                        Stock Out
                                    </span>
                                    <?php else: ?>
                                    <button type="button" class="dropdown-item" data-bs-toggle="modal"
                                            data-bs-target="#stockoutModal<?= $id ?>">
                                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V4.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 4.707V14.5a.5.5 0 0 0 .5.5M2 1.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5"/></svg>
                                        Stock Out
                                    </button>
                                    <?php endif; ?>

                                    <?php if ($isManager): ?>
                                    <!-- Edit and Delete are general manager only actions -->
                                    <button type="button" class="dropdown-item" data-bs-toggle="modal"
                                            data-bs-target="#editModal<?= $id ?>">
                                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293z"/></svg>
                                        Edit
                                    </button>
                                    <div class="dropdown-divider"></div>
                                    <form method="POST" action="<?= BASE_URL ?>materials/delete/<?= $id ?>"
                                          onsubmit="return confirm('Delete <?= htmlspecialchars(addslashes($material['name'])) ?>? This also removes its movement history and cannot be undone.');">
                                        <button type="submit" class="dropdown-item is-danger">
                                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
                                            Delete
                                        </button>
                                    </form>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php endif; ?>
    </div>
</div>

<!-- ============ STOCK IN / STOCK OUT MODALS ============ -->
<?php foreach ($materials as $material): ?>
<?php
    $id = $material['material_id'];
    $stock = (int) $material['stock_quantity'];
    $unit = htmlspecialchars($material['unit']);
?>

<!-- Stock In modal: logs incoming stock for this material.
     Submits to the same movements/stockin endpoint as the full page,
     so validation and stock math are unchanged. -->
<div class="modal fade" id="stockinModal<?= $id ?>" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <form method="POST" action="<?= BASE_URL ?>movements/stockin" enctype="multipart/form-data"
                  data-loading novalidate>
                <input type="hidden" name="material_id" value="<?= $id ?>">
                <div class="modal-header">
                    <div>
                        <h5 class="modal-title">Stock In</h5>
                        <p class="cb-modal-sub"><?= htmlspecialchars($material['name']) ?></p>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="cb-stock-panel">
                        <span class="cb-label">Current Stock</span>
                        <span class="cb-stock-panel-num"><?= $stock ?> <span class="text-muted" style="font-size:13px;font-weight:500;"><?= $unit ?></span></span>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Quantity Received</label>
                        <div class="cb-stepper">
                            <button type="button" data-step="down" aria-label="Decrease">&minus;</button>
                            <input type="number" name="quantity" value="1" min="1" step="1" required>
                            <button type="button" data-step="up" aria-label="Increase">+</button>
                        </div>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Reason</label>
                        <select name="reason" class="cb-select">
                            <option value="Purchase">Purchase</option>
                            <option value="Restock">Restock</option>
                            <option value="Return">Return</option>
                            <option value="Correction">Stock Correction</option>
                        </select>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Reference <span class="text-muted">(optional)</span></label>
                        <input type="text" name="reference" class="cb-input" placeholder="e.g. PO-1042 or delivery receipt no.">
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Notes <span class="text-muted">(optional)</span></label>
                        <textarea name="notes" class="cb-textarea" rows="2"></textarea>
                    </div>

                    <div class="cb-field mb-0">
                        <label class="cb-field-label">Receipt Photo <span class="text-muted">(optional)</span></label>
                        <input type="file" name="receipt" class="cb-input" accept="image/jpeg,image/png,image/webp">
                        <div class="cb-help">JPG, PNG, or WEBP image, up to 5 MB. Date is recorded automatically as today.</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="cb-btn cb-btn-in" data-loading-text="Saving...">Confirm Stock In</button>
                </div>
            </form>
        </div>
    </div>
</div>

<?php if ($stock > 0): ?>
<!-- Stock Out modal: logs a withdrawal for this material.
     Submits to movements/stockout, which also runs the low-stock
     email alert check after saving. The quantity cannot exceed the
     stock on hand, enforced both here and again on the server. -->
<div class="modal fade" id="stockoutModal<?= $id ?>" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <form method="POST" action="<?= BASE_URL ?>movements/stockout" data-loading novalidate>
                <input type="hidden" name="material_id" value="<?= $id ?>">
                <div class="modal-header">
                    <div>
                        <h5 class="modal-title">Stock Out</h5>
                        <p class="cb-modal-sub"><?= htmlspecialchars($material['name']) ?></p>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="cb-stock-panel">
                        <span class="cb-label">Current Stock</span>
                        <span class="cb-stock-panel-num"><?= $stock ?> <span class="text-muted" style="font-size:13px;font-weight:500;"><?= $unit ?></span></span>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Quantity Removed</label>
                        <div class="cb-stepper">
                            <button type="button" data-step="down" aria-label="Decrease">&minus;</button>
                            <input type="number" name="quantity" value="1" min="1" max="<?= $stock ?>" step="1" required>
                            <button type="button" data-step="up" aria-label="Increase">+</button>
                        </div>
                        <div class="cb-help">Maximum <?= $stock ?> <?= $unit ?> available.</div>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Reason</label>
                        <select name="reason" class="cb-select">
                            <option value="Project Usage">Project Usage</option>
                            <option value="Damaged">Damaged</option>
                            <option value="Transfer">Transfer</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Project <span class="text-muted">(optional)</span></label>
                        <input type="text" name="reference" class="cb-input" placeholder="e.g. Sofa set for Ms. Reyes">
                    </div>

                    <div class="cb-field mb-0">
                        <label class="cb-field-label">Notes <span class="text-muted">(optional)</span></label>
                        <textarea name="notes" class="cb-textarea" rows="2"></textarea>
                        <div class="cb-help">Date is recorded automatically as today.</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="cb-btn cb-btn-out" data-loading-text="Saving...">Confirm Stock Out</button>
                </div>
            </form>
        </div>
    </div>
</div>
<?php endif; ?>
<?php endforeach; ?>

<!-- ============ EDIT MODALS (general manager only) ============ -->
<?php if ($isManager): ?>
<?php foreach ($materials as $material): ?>
<!-- Edit modal for <?= htmlspecialchars($material['name']) ?>.
     Submits to the materials/edit endpoint, so all server-side
     validation and role rules still apply. -->
<div class="modal fade" id="editModal<?= $material['material_id'] ?>" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
            <form method="POST" action="<?= BASE_URL ?>materials/edit/<?= $material['material_id'] ?>" novalidate>
                <div class="modal-header">
                    <div>
                        <h5 class="modal-title">Edit Material</h5>
                        <p class="cb-modal-sub"><?= htmlspecialchars($material['name']) ?></p>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="cb-field">
                                <label class="cb-field-label">Material Name</label>
                                <input type="text" name="name" class="cb-input" required
                                       value="<?= htmlspecialchars($material['name']) ?>">
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="cb-field">
                                <label class="cb-field-label">Category</label>
                                <input type="text" name="category" list="categoryOptions" class="cb-input" required
                                       value="<?= htmlspecialchars($material['category']) ?>">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="cb-field">
                                <label class="cb-field-label">Size</label>
                                <input type="text" name="size" class="cb-input"
                                       value="<?= htmlspecialchars($material['size']) ?>">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="cb-field">
                                <label class="cb-field-label">Unit</label>
                                <input type="text" name="unit" class="cb-input" required
                                       value="<?= htmlspecialchars($material['unit']) ?>">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="cb-field">
                                <label class="cb-field-label">Current Stock</label>
                                <input type="text" class="cb-input" value="<?= (int) $material['stock_quantity'] ?>" disabled>
                                <div class="cb-help">Only changes through Stock In / Stock Out.</div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="cb-field">
                                <label class="cb-field-label">Minimum Threshold</label>
                                <input type="number" min="0" step="1" name="min_threshold" class="cb-input" required
                                       value="<?= (int) $material['min_threshold'] ?>">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="cb-field">
                                <label class="cb-field-label">Cost per Unit (PHP)</label>
                                <input type="number" min="0" step="0.01" name="cost_per_unit" class="cb-input"
                                       value="<?= htmlspecialchars($material['cost_per_unit'] ?? '') ?>">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="cb-field">
                                <label class="cb-field-label">Supplier</label>
                                <select name="supplier_id" class="cb-select">
                                    <option value="">-- None --</option>
                                    <?php foreach ($suppliers as $supplier): ?>
                                    <option value="<?= $supplier['supplier_id'] ?>" <?= ((int) ($material['supplier_id'] ?? 0) === (int) $supplier['supplier_id']) ? 'selected' : '' ?>>
                                        <?= htmlspecialchars($supplier['name']) ?>
                                    </option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="cb-field mb-0">
                                <label class="cb-field-label">Notes</label>
                                <textarea name="notes" class="cb-textarea" rows="2"><?= htmlspecialchars($material['notes'] ?? '') ?></textarea>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="cb-btn cb-btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>
<?php endforeach; ?>
<?php endif; ?>
