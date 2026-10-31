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

    // ============================================================
    // Dashboard chart
    // ============================================================

    // Totals the quantity moved in and out per day for the last N days.
    // Returns one entry per day including days with no activity, so the
    // chart always shows an even timeline instead of skipping dates.
    public function getDailyTotals(int $days = 14): array
    {
        $sql = 'SELECT movement_date,
                       SUM(CASE WHEN type = "in" THEN quantity ELSE 0 END) AS total_in,
                       SUM(CASE WHEN type = "out" THEN quantity ELSE 0 END) AS total_out
                FROM stock_movements
                WHERE movement_date >= (CURDATE() - INTERVAL :days DAY)
                GROUP BY movement_date';
        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(':days', $days - 1, PDO::PARAM_INT);
        $stmt->execute();

        // Index the rows by date so each day can be looked up quickly
        $byDate = [];
        foreach ($stmt->fetchAll() as $row) {
            $byDate[$row['movement_date']] = $row;
        }

        // Walk backwards from today, filling in zeros for quiet days
        $series = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime('-' . $i . ' days'));
            $series[] = [
                'date' => $date,
                'in'   => (int) ($byDate[$date]['total_in'] ?? 0),
                'out'  => (int) ($byDate[$date]['total_out'] ?? 0),
            ];
        }
        return $series;
    }

    // ============================================================
    // Movement report
    // ============================================================

    // Movements filtered by date range, type, and material.
    // $options keys: date_from, date_to, type, material_id
    public function getFiltered(array $options = []): array
    {
        $sql = 'SELECT sm.*, m.name AS material_name, m.unit, m.category,
                       u.name AS logged_by_name
                FROM stock_movements sm
                JOIN materials m ON sm.material_id = m.material_id
                JOIN users u ON sm.logged_by = u.user_id
                WHERE 1 = 1';
        $params = [];

        if (!empty($options['date_from'])) {
            $sql .= ' AND sm.movement_date >= :date_from';
            $params[':date_from'] = $options['date_from'];
        }
        if (!empty($options['date_to'])) {
            $sql .= ' AND sm.movement_date <= :date_to';
            $params[':date_to'] = $options['date_to'];
        }
        if (!empty($options['type']) && in_array($options['type'], ['in', 'out'], true)) {
            $sql .= ' AND sm.type = :type';
            $params[':type'] = $options['type'];
        }
        if (!empty($options['material_id']) && ctype_digit((string) $options['material_id'])) {
            $sql .= ' AND sm.material_id = :material_id';
            $params[':material_id'] = (int) $options['material_id'];
        }

        $sql .= ' ORDER BY sm.movement_date DESC, sm.movement_id DESC';

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
