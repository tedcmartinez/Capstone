<?php
// Material model
// Handles all database access for the materials catalog

class Material extends Model
{
    // Returns all materials, optionally filtered by a keyword matched
    // against name or category. Joins suppliers to get the supplier name.
    public function getAll(string $keyword = ''): array
    {
        $sql = 'SELECT m.*, s.name AS supplier_name
                FROM materials m
                LEFT JOIN suppliers s ON m.supplier_id = s.supplier_id';
        $params = [];
        if ($keyword !== '') {
            // PDO requires each named placeholder to be unique, so the same
            // keyword is bound twice under two different names
            $sql .= ' WHERE m.name LIKE :kw_name OR m.category LIKE :kw_category';
            $params[':kw_name'] = '%' . $keyword . '%';
            $params[':kw_category'] = '%' . $keyword . '%';
        }
        $sql .= ' ORDER BY m.name ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // Returns the list of distinct categories already in use.
    // Used to suggest existing categories on the add/edit material forms
    // while still allowing a brand new category to be typed in.
    public function getCategories(): array
    {
        $sql = 'SELECT DISTINCT category FROM materials ORDER BY category ASC';
        return $this->db->query($sql)->fetchAll(PDO::FETCH_COLUMN);
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT m.*, s.name AS supplier_name
                                     FROM materials m
                                     LEFT JOIN suppliers s ON m.supplier_id = s.supplier_id
                                     WHERE m.material_id = :id');
        $stmt->execute([':id' => $id]);
        $result = $stmt->fetch();
        return $result ?: null;
    }

    // Inserts a new material, including its opening stock quantity
    public function create(array $data): int
    {
        $sql = 'INSERT INTO materials (name, category, size, unit, stock_quantity, min_threshold, cost_per_unit, supplier_id, notes)
                VALUES (:name, :category, :size, :unit, :stock_quantity, :min_threshold, :cost_per_unit, :supplier_id, :notes)';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            ':name' => $data['name'],
            ':category' => $data['category'],
            ':size' => $data['size'],
            ':unit' => $data['unit'],
            ':stock_quantity' => $data['stock_quantity'],
            ':min_threshold' => $data['min_threshold'],
            ':cost_per_unit' => $data['cost_per_unit'],
            ':supplier_id' => $data['supplier_id'],
            ':notes' => $data['notes'],
        ]);
        return (int) $this->db->lastInsertId();
    }

    // Updates a material's catalog details.
    // Does NOT touch stock_quantity, that field only changes through
    // stock-in / stock-out movements so the totals always stay accurate.
    public function update(int $id, array $data): bool
    {
        $sql = 'UPDATE materials SET
                    name = :name,
                    category = :category,
                    size = :size,
                    unit = :unit,
                    min_threshold = :min_threshold,
                    cost_per_unit = :cost_per_unit,
                    supplier_id = :supplier_id,
                    notes = :notes
                WHERE material_id = :id';
        $stmt = $this->db->prepare($sql);
        return $stmt->execute([
            ':name' => $data['name'],
            ':category' => $data['category'],
            ':size' => $data['size'],
            ':unit' => $data['unit'],
            ':min_threshold' => $data['min_threshold'],
            ':cost_per_unit' => $data['cost_per_unit'],
            ':supplier_id' => $data['supplier_id'],
            ':notes' => $data['notes'],
            ':id' => $id,
        ]);
    }

    public function delete(int $id): bool
    {
        $stmt = $this->db->prepare('DELETE FROM materials WHERE material_id = :id');
        return $stmt->execute([':id' => $id]);
    }

    // Adjusts stock_quantity by a positive (stock-in) or negative (stock-out) amount
    public function adjustStock(int $id, int $amount): bool
    {
        $stmt = $this->db->prepare('UPDATE materials SET stock_quantity = stock_quantity + :amount WHERE material_id = :id');
        return $stmt->execute([':amount' => $amount, ':id' => $id]);
    }

    // Returns materials at or below their minimum threshold, used by the
    // dashboard and the printable reorder checklist
    public function getLowStock(): array
    {
        $sql = 'SELECT m.*, s.name AS supplier_name
                FROM materials m
                LEFT JOIN suppliers s ON m.supplier_id = s.supplier_id
                WHERE m.stock_quantity <= m.min_threshold
                ORDER BY m.stock_quantity ASC';
        return $this->db->query($sql)->fetchAll();
    }

    public function countAll(): int
    {
        return (int) $this->db->query('SELECT COUNT(*) FROM materials')->fetchColumn();
    }

    public function countLowStock(): int
    {
        return (int) $this->db->query('SELECT COUNT(*) FROM materials WHERE stock_quantity <= min_threshold')->fetchColumn();
    }

    public function countStockOut(): int
    {
        return (int) $this->db->query('SELECT COUNT(*) FROM materials WHERE stock_quantity = 0')->fetchColumn();
    }
}
