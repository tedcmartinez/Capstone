<?php
// Movement history: all stock-in / stock-out transactions, sortable by column
$columns = [
    'material_name' => 'Material',
    'type' => 'Type',
    'quantity' => 'Quantity',
    'movement_date' => 'Date',
    'logged_by_name' => 'Logged By',
];
?>
<h3 class="mb-3">Movement History</h3>

<div class="table-responsive">
<table class="table table-bordered table-hover">
    <thead class="table-dark">
        <tr>
            <?php foreach ($columns as $field => $label): ?>
            <?php
                $newDir = ($sort === $field && $direction === 'asc') ? 'desc' : 'asc';
                $arrow = $sort === $field ? ($direction === 'asc' ? ' (asc)' : ' (desc)') : '';
            ?>
            <th><a href="<?= BASE_URL ?>movements?sort=<?= $field ?>&dir=<?= $newDir ?>" class="text-white text-decoration-none"><?= $label . $arrow ?></a></th>
            <?php endforeach; ?>
            <th>Notes</th>
            <th>Receipt</th>
        </tr>
    </thead>
    <tbody>
        <?php if (empty($movements)): ?>
        <tr><td colspan="7" class="text-center text-muted">No movements logged yet.</td></tr>
        <?php endif; ?>
        <?php foreach ($movements as $m): ?>
        <tr>
            <td><?= htmlspecialchars($m['material_name']) ?></td>
            <td><span class="badge <?= $m['type'] === 'in' ? 'bg-success' : 'bg-warning text-dark' ?>"><?= strtoupper($m['type']) ?></span></td>
            <td><?= (int) $m['quantity'] ?></td>
            <td><?= htmlspecialchars($m['movement_date']) ?></td>
            <td><?= htmlspecialchars($m['logged_by_name']) ?></td>
            <td><?= htmlspecialchars($m['notes']) ?></td>
            <td>
                <?php if (!empty($m['receipt_file'])): ?>
                <a href="<?= BASE_URL ?>uploads/receipts/<?= htmlspecialchars($m['receipt_file']) ?>" target="_blank" class="btn btn-sm btn-outline-secondary">View</a>
                <?php else: ?>
                <span class="text-muted">-</span>
                <?php endif; ?>
            </td>
        </tr>
        <?php endforeach; ?>
    </tbody>
</table>
</div>
