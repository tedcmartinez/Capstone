<?php
// Reorder checklist for materials at or below their minimum threshold.
// This whole page is general manager only, so the supplier column is always shown.
// The list updates itself: a material disappears as soon as stock-in
// brings it back above the threshold.
?>
<div class="d-flex justify-content-between align-items-center mb-3">
    <h3>Reorder Checklist</h3>
    <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#sendChecklistModal"
            <?= empty($lowStockMaterials) ? 'disabled' : '' ?>>Send by Email</button>
</div>

<?php if ($sent !== null): ?>
<div class="alert <?= ((int) $failed) > 0 ? 'alert-warning' : 'alert-success' ?>">
    Checklist emailed to <?= (int) $sent ?> recipient(s).
    <?php if ((int) $failed > 0): ?>
    <?= (int) $failed ?> send(s) failed. Check the SMTP settings or try again.
    <?php endif; ?>
</div>
<?php endif; ?>

<table class="table table-bordered">
    <thead class="table-dark">
        <tr>
            <th>Material</th>
            <th>Current Qty</th>
            <th>Unit</th>
            <th>Threshold</th>
            <th>Supplier</th>
        </tr>
    </thead>
    <tbody>
        <?php if (empty($lowStockMaterials)): ?>
        <tr><td colspan="5" class="text-center text-muted">Nothing to reorder. All materials are above threshold.</td></tr>
        <?php endif; ?>
        <?php foreach ($lowStockMaterials as $material): ?>
        <tr>
            <td><?= htmlspecialchars($material['name']) ?></td>
            <td><?= (int) $material['stock_quantity'] ?></td>
            <td><?= htmlspecialchars($material['unit']) ?></td>
            <td><?= (int) $material['min_threshold'] ?></td>
            <td><?= htmlspecialchars($material['supplier_name'] ?? '-') ?></td>
        </tr>
        <?php endforeach; ?>
    </tbody>
</table>

<!-- Send checklist modal: choose which recipients get the emailed report -->
<div class="modal fade" id="sendChecklistModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <form method="POST" action="<?= BASE_URL ?>checklist/send">
                <div class="modal-header">
                    <h5 class="modal-title">Send Reorder Checklist</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p class="mb-2">Send to:</p>
                    <?php foreach ($activeUsers as $user): ?>
                    <div class="form-check mb-1">
                        <input class="form-check-input" type="checkbox" name="recipients[]"
                               value="<?= $user['user_id'] ?>" id="recipient<?= $user['user_id'] ?>">
                        <label class="form-check-label" for="recipient<?= $user['user_id'] ?>">
                            <?= htmlspecialchars($user['name']) ?>
                            <span class="text-muted">(<?= htmlspecialchars($user['email']) ?>)</span>
                        </label>
                    </div>
                    <?php endforeach; ?>
                    <div class="mt-3">
                        <label class="form-label">Other email (optional)</label>
                        <input type="email" name="extra_email" class="form-control" placeholder="someone@example.com">
                        <div class="form-text">For a supplier or anyone without a system account.</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary">Send Checklist</button>
                </div>
            </form>
        </div>
    </div>
</div>
