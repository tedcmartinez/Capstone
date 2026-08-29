<?php
// Log a stock-in (incoming materials) transaction.
// This is the full-page version, used from the sidebar. The materials
// catalog offers the same form inside a modal, posting to this same route.
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Stock In</h1>
        <p class="cb-page-sub">Record materials received into the warehouse</p>
    </div>
    <a href="<?= BASE_URL ?>movements" class="cb-btn cb-btn-outline">Back to History</a>
</div>

<?php if (!empty($errors)): ?>
<div class="cb-alert is-danger">
    <div>
        <strong>Please check the form</strong>
        <ul class="mt-1">
            <?php foreach ($errors as $error): ?><li><?= htmlspecialchars($error) ?></li><?php endforeach; ?>
        </ul>
    </div>
</div>
<?php endif; ?>

<div class="row">
    <div class="col-12 col-lg-7">
        <div class="cb-card">
            <div class="cb-card-body">
                <form method="POST" action="<?= BASE_URL ?>movements/stockin" enctype="multipart/form-data"
                      data-loading novalidate>
                    <div class="cb-field">
                        <label class="cb-field-label">Material</label>
                        <select name="material_id" class="cb-select" required>
                            <option value="">-- Select material --</option>
                            <?php foreach ($materials as $material): ?>
                            <option value="<?= $material['material_id'] ?>">
                                <?= htmlspecialchars($material['name']) ?>
                                (<?= (int) $material['stock_quantity'] ?> <?= htmlspecialchars($material['unit']) ?> in stock)
                            </option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Quantity Received</label>
                        <div class="cb-stepper">
                            <button type="button" data-step="down" aria-label="Decrease">&minus;</button>
                            <input type="number" name="quantity" value="1" min="1" step="1" required>
                            <button type="button" data-step="up" aria-label="Increase">+</button>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-md-6">
                            <div class="cb-field">
                                <label class="cb-field-label">Reason</label>
                                <select name="reason" class="cb-select">
                                    <option value="Purchase">Purchase</option>
                                    <option value="Restock">Restock</option>
                                    <option value="Return">Return</option>
                                    <option value="Correction">Stock Correction</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="cb-field">
                                <label class="cb-field-label">Reference <span class="text-muted">(optional)</span></label>
                                <input type="text" name="reference" class="cb-input" placeholder="e.g. PO-1042">
                            </div>
                        </div>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Date</label>
                        <!-- Display only. The actual date is stamped by the server so it
                             cannot be changed or backdated. -->
                        <input type="text" class="cb-input" value="<?= date('F j, Y') ?>" disabled>
                        <div class="cb-help">Recorded automatically as today's date.</div>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Notes <span class="text-muted">(optional)</span></label>
                        <textarea name="notes" class="cb-textarea" rows="3"></textarea>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Receipt Photo <span class="text-muted">(optional)</span></label>
                        <input type="file" name="receipt" class="cb-input" accept="image/jpeg,image/png,image/webp">
                        <div class="cb-help">JPG, PNG, or WEBP image, up to 5 MB.</div>
                    </div>

                    <div class="d-flex gap-2 mt-4">
                        <button type="submit" class="cb-btn cb-btn-in" data-loading-text="Saving...">Confirm Stock In</button>
                        <a href="<?= BASE_URL ?>movements" class="cb-btn cb-btn-outline">Cancel</a>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <div class="col-12 col-lg-5">
        <div class="cb-card">
            <div class="cb-card-head">
                <h2 class="cb-section-title">How this works</h2>
            </div>
            <div class="cb-card-body">
                <p class="text-muted mb-3" style="font-size:13px;">
                    Stock In adds to a material's running total and creates a permanent
                    entry in the movement history.
                </p>
                <ul class="text-muted mb-0" style="font-size:13px;padding-left:18px;line-height:1.9;">
                    <li>The quantity must be greater than zero.</li>
                    <li>The date is set by the server and cannot be backdated.</li>
                    <li>A receipt photo can be attached for the manager's records.</li>
                    <li>Once saved, the dashboard totals update straight away.</li>
                </ul>
            </div>
        </div>
    </div>
</div>
