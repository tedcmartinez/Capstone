<?php
// Reorder checklist for materials at or below their minimum threshold.
// This whole page is general manager only, so the supplier column is always shown.
// The list updates itself: a material disappears as soon as stock-in
// brings it back above the threshold.
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Reorder Checklist</h1>
        <p class="cb-page-sub">
            <?= count($lowStockMaterials) ?> material<?= count($lowStockMaterials) === 1 ? '' : 's' ?>
            at or below threshold as of <?= date('F j, Y') ?>
        </p>
    </div>
    <div class="d-flex gap-2 d-print-none">
        <button type="button" class="cb-btn cb-btn-outline" onclick="window.print();">
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/></svg>
            Print
        </button>
        <button type="button" class="cb-btn cb-btn-primary" data-bs-toggle="modal" data-bs-target="#sendChecklistModal"
                <?= empty($lowStockMaterials) ? 'disabled' : '' ?>>
            <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z"/></svg>
            Send by Email
        </button>
    </div>
</div>

<?php if ($sent !== null): ?>
<div class="cb-alert <?= ((int) $failed) > 0 ? 'is-warning' : 'is-success' ?>">
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="flex-shrink:0;margin-top:2px;"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>
    <div>
        Checklist emailed to <?= (int) $sent ?> recipient<?= (int) $sent === 1 ? '' : 's' ?>.
        <?php if ((int) $failed > 0): ?>
        <?= (int) $failed ?> send<?= (int) $failed === 1 ? '' : 's' ?> failed. Check the SMTP settings or try again.
        <?php endif; ?>
    </div>
</div>
<?php endif; ?>

<div class="cb-card">
    <div class="cb-card-body is-flush">
        <?php if (empty($lowStockMaterials)): ?>
        <div class="cb-empty">
            <div class="cb-empty-icon">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>
            </div>
            <div class="cb-empty-title">Nothing to reorder</div>
            <p class="cb-empty-text">All materials are above their minimum threshold.</p>
        </div>
        <?php else: ?>
        <div class="cb-table-wrap">
        <table class="cb-table">
            <thead>
                <tr>
                    <th style="width:40px;" class="d-print-none"></th>
                    <th>Material</th>
                    <th class="cb-num">Current Qty</th>
                    <th>Unit</th>
                    <th class="cb-num">Threshold</th>
                    <th>Status</th>
                    <th>Supplier</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($lowStockMaterials as $material): ?>
                <?php $st = stockStatus($material['stock_quantity'], $material['min_threshold']); ?>
                <tr>
                    <!-- Tick box for the manager to mark items off while ordering.
                         It is a working aid only, nothing is saved to the database. -->
                    <td class="d-print-none">
                        <input type="checkbox" class="form-check-input" aria-label="Mark as ordered">
                    </td>
                    <td class="cb-cell-name"><?= htmlspecialchars($material['name']) ?></td>
                    <td class="cb-num"><span class="cb-cell-stock"><?= (int) $material['stock_quantity'] ?></span></td>
                    <td class="text-muted"><?= htmlspecialchars($material['unit']) ?></td>
                    <td class="cb-num text-muted"><?= (int) $material['min_threshold'] ?></td>
                    <td><span class="cb-badge is-<?= $st ?>"><?= stockStatusLabel($st) ?></span></td>
                    <td class="text-muted"><?= htmlspecialchars($material['supplier_name'] ?? '-') ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php endif; ?>
    </div>
</div>

<!-- Send checklist modal: choose which recipients get the emailed report -->
<div class="modal fade" id="sendChecklistModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <form method="POST" action="<?= BASE_URL ?>checklist/send" data-loading>
                <div class="modal-header">
                    <div>
                        <h5 class="modal-title">Send Reorder Checklist</h5>
                        <p class="cb-modal-sub">Emails the current list of materials to reorder</p>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="cb-label mb-2">Send to</div>
                    <?php foreach ($activeUsers as $user): ?>
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" name="recipients[]"
                               value="<?= $user['user_id'] ?>" id="recipient<?= $user['user_id'] ?>">
                        <label class="form-check-label" for="recipient<?= $user['user_id'] ?>" style="font-size:13.5px;">
                            <?= htmlspecialchars($user['name']) ?>
                            <span class="text-muted">(<?= htmlspecialchars($user['email']) ?>)</span>
                        </label>
                    </div>
                    <?php endforeach; ?>

                    <div class="cb-field mt-3 mb-0">
                        <label class="cb-field-label">Other email <span class="text-muted">(optional)</span></label>
                        <input type="email" name="extra_email" class="cb-input" placeholder="someone@example.com">
                        <div class="cb-help">For a supplier or anyone without a system account.</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="cb-btn cb-btn-outline" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="cb-btn cb-btn-primary" data-loading-text="Sending...">Send Checklist</button>
                </div>
            </form>
        </div>
    </div>
</div>
