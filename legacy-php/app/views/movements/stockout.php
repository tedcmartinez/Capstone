<?php
// Log a stock-out (materials withdrawn for production) transaction.
// Each withdrawal is logged individually and in real time, not as a project batch.
// Saving a stock-out also triggers the low-stock email alert check.
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Stock Out</h1>
        <p class="cb-page-sub">Record materials withdrawn for production</p>
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
                <form method="POST" action="<?= BASE_URL ?>movements/stockout" data-loading novalidate>
                    <div class="cb-field">
                        <label class="cb-field-label">Material</label>
                        <select name="material_id" class="cb-select" required>
                            <option value="">-- Select material --</option>
                            <?php foreach ($materials as $material): ?>
                            <option value="<?= $material['material_id'] ?>" <?= (int) $material['stock_quantity'] === 0 ? 'disabled' : '' ?>>
                                <?= htmlspecialchars($material['name']) ?>
                                (<?= (int) $material['stock_quantity'] ?> <?= htmlspecialchars($material['unit']) ?> in stock)
                                <?= (int) $material['stock_quantity'] === 0 ? ' - out of stock' : '' ?>
                            </option>
                            <?php endforeach; ?>
                        </select>
                        <div class="cb-help">Materials with no stock left cannot be selected.</div>
                    </div>

                    <div class="cb-field">
                        <label class="cb-field-label">Quantity Removed</label>
                        <div class="cb-stepper">
                            <button type="button" data-step="down" aria-label="Decrease">&minus;</button>
                            <input type="number" name="quantity" value="1" min="1" step="1" required>
                            <button type="button" data-step="up" aria-label="Increase">+</button>
                        </div>
                        <div class="cb-help">The server rejects any amount larger than the stock on hand.</div>
                    </div>

                    <div class="row">
                        <div class="col-md-6">
                            <div class="cb-field">
                                <label class="cb-field-label">Reason</label>
                                <select name="reason" class="cb-select">
                                    <option value="Project Usage">Project Usage</option>
                                    <option value="Damaged">Damaged</option>
                                    <option value="Transfer">Transfer</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="cb-field">
                                <label class="cb-field-label">Project <span class="text-muted">(optional)</span></label>
                                <input type="text" name="reference" class="cb-input" placeholder="e.g. Sofa set for Ms. Reyes">
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

                    <div class="d-flex gap-2 mt-4">
                        <button type="submit" class="cb-btn cb-btn-out" data-loading-text="Saving...">Confirm Stock Out</button>
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
                    Stock Out subtracts from a material's running total and creates a
                    permanent entry in the movement history.
                </p>
                <ul class="text-muted mb-0" style="font-size:13px;padding-left:18px;line-height:1.9;">
                    <li>You cannot remove more than the stock currently on hand.</li>
                    <li>The date is set by the server and cannot be backdated.</li>
                    <li>If the material falls to or below its threshold, an email
                        alert is sent automatically.</li>
                    <li>Repeat alerts for the same material are skipped for 24 hours.</li>
                </ul>
            </div>
        </div>
    </div>
</div>
