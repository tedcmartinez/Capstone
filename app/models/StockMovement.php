<?php
// StockMovement model
// Handles all database access for stock-in / stock-out transaction logs

class StockMovement extends Model
{
    public function create(array $data): int
    {
        $sql = 'INSERT INTO stock_movements (material_id, type, quantity, movement_date, logged_by, notes, receipt_file)
                VALUES (:material_id, :type, :quantity, :movement_date, :logged_by, :notes, :receipt_file)';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            ':material_id' => $data['material_id'],
            ':type' => $data['type'],
            ':quantity' => $data['quantity'],
            ':movement_date' => $data['movement_date'],
            ':logged_by' => $data['logged_by'],
            ':notes' => $data['notes'],
            ':receipt_file' => $data['receipt_file'] ?? null,
        ]);
        return (int) $this->db->lastInsertId();
    }

    // Returns every movement with the material name and the logging user's
    // name attached, most recent first. Sorting by column is done in PHP
    // by the controller since the list is small enough for a furniture shop.
    public function getAll(): array
    {
        $sql = 'SELECT sm.*, m.name AS material_name, u.name AS logged_by_name
                FROM stock_movements sm
                JOIN materials m ON sm.material_id = m.material_id
                JOIN users u ON sm.logged_by = u.user_id
                ORDER BY sm.movement_date DESC, sm.movement_id DESC';
        return $this->db->query($sql)->fetchAll();
    }

    // Returns the most recent N movements, used on the GM dashboard
    public function getRecent(int $limit = 10): array
    {
        $sql = 'SELECT sm.*, m.name AS material_name, u.name AS logged_by_name
                FROM stock_movements sm
                JOIN materials m ON sm.material_id = m.material_id
                JOIN users u ON sm.logged_by = u.user_id
                ORDER BY sm.movement_date DESC, sm.movement_id DESC
                LIMIT :limit';
        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}
