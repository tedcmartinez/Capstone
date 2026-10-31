<?php
// Suppliers list. Shows every supplier with how many materials they supply
// and how many of those currently need reordering, so the manager knows
// who to contact first. General manager only.
?>

<div class="cb-page-head">
    <div>
        <h1 class="cb-page-title">Suppliers</h1>
        <p class="cb-page-sub"><?= count($supplierStats) ?> supplier<?= count($supplierStats) === 1 ? '' : 's' ?> on record</p>
    </div>
    <a href="<?= BASE_URL ?>checklist" class="cb-btn cb-btn-outline">
        <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M5 11.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m-2-3a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5"/><path d="M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></svg>
        Reorder Checklist
    </a>
</div>

<div class="cb-card">
    <div class="cb-card-body is-flush">
        <?php if (empty($supplierStats)): ?>
        <div class="cb-empty">
            <div class="cb-empty-icon">
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M0 3.5A1.5 1.5 0 0 1 1.5 2h9A1.5 1.5 0 0 1 12 3.5V5h1.02a1.5 1.5 0 0 1 1.17.563l1.481 1.85a1.5 1.5 0 0 1 .329.938V10.5a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 1 1-4 0H6a2 2 0 1 1-3.998-.085A1.5 1.5 0 0 1 0 10.5zm1.5-.5a.5.5 0 0 0-.5.5v7.014l.24-.317A1.99 1.99 0 0 1 4 9.5c.622 0 1.18.284 1.546.729l.24-.229H11V3.5a.5.5 0 0 0-.5-.5zM12 6v3.5h3v-.15a.5.5 0 0 0-.11-.312l-1.48-1.85A.5.5 0 0 0 13.02 6zM4 10.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2m8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2"/></svg>
            </div>
            <div class="cb-empty-title">No suppliers recorded</div>
            <p class="cb-empty-text">Suppliers are added directly to the database and then linked to materials.</p>
        </div>
        <?php else: ?>
        <div class="cb-table-wrap">
        <table class="cb-table">
            <thead>
                <tr>
                    <th>Supplier</th>
                    <th>Viber Contact</th>
                    <th class="cb-num">Materials</th>
                    <th class="cb-num">Stock Value</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th class="cb-num">Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($supplierStats as $supplier): ?>
                <?php $reorderCount = (int) $supplier['reorder_count']; ?>
                <tr>
                    <td class="cb-cell-name"><?= htmlspecialchars($supplier['name']) ?></td>
                    <td class="text-muted"><?= htmlspecialchars($supplier['viber_contact'] ?? '') ?: '-' ?></td>
                    <td class="cb-num"><?= (int) $supplier['item_count'] ?></td>
                    <td class="cb-num"><?= peso($supplier['total_value']) ?></td>
                    <td>
                        <?php if ((int) $supplier['item_count'] === 0): ?>
                        <span class="cb-badge is-neutral">No Materials</span>
                        <?php elseif ($reorderCount > 0): ?>
                        <span class="cb-badge is-low"><?= $reorderCount ?> To Reorder</span>
                        <?php else: ?>
                        <span class="cb-badge is-healthy">All Healthy</span>
                        <?php endif; ?>
                    </td>
                    <td class="text-muted" style="max-width:240px;"><?= htmlspecialchars($supplier['notes'] ?? '') ?: '-' ?></td>
                    <td class="cb-num">
                        <a class="cb-btn cb-btn-outline cb-btn-sm"
                           href="<?= BASE_URL ?>materials?supplier=<?= (int) $supplier['supplier_id'] ?>">
                            View Materials
                        </a>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        <?php endif; ?>
    </div>
</div>
