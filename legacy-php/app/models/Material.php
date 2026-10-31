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

    // ============================================================
    // Inventory health
    // The dashboard splits the catalog into three states so the
    // manager can see the condition of stock at a glance:
    //   out     = nothing left at all
    //   low     = still has stock, but at or below the threshold
    //   healthy = above the threshold
    // countLowStock() above is kept unchanged because the reorder
    // checklist and the email alerts both rely on it.
    // ============================================================

    // Low but not empty, so it is not counted twice with out-of-stock
    public function countLowOnly(): int
    {
        $sql = 'SELECT COUNT(*) FROM materials
                WHERE stock_quantity > 0 AND stock_quantity <= min_threshold';
        return (int) $this->db->query($sql)->fetchColumn();
    }

    public function countHealthy(): int
    {
        return (int) $this->db->query('SELECT COUNT(*) FROM materials WHERE stock_quantity > min_threshold')->fetchColumn();
    }

    // Total money value of everything on hand: stock x cost per unit.
    // Materials with no cost recorded simply add nothing to the total.
    public function inventoryValue(): float
    {
        $sql = 'SELECT COALESCE(SUM(stock_quantity * cost_per_unit), 0) FROM materials';
        return (float) $this->db->query($sql)->fetchColumn();
    }

    // ============================================================
    // Catalog search, filtering and sorting
    // ============================================================

    // Returns materials matching the search box and the filter dropdowns,
    // sorted by the chosen column.
    // $options keys: keyword, category, status, supplier_id, sort, direction
    public function getFiltered(array $options = []): array
    {
        $keyword    = trim($options['keyword'] ?? '');
        $category   = trim($options['category'] ?? '');
        $status     = $options['status'] ?? '';
        $supplierId = $options['supplier_id'] ?? '';

        $sql = 'SELECT m.*, s.name AS supplier_name
                FROM materials m
                LEFT JOIN suppliers s ON m.supplier_id = s.supplier_id
                WHERE 1 = 1';
        $params = [];

        if ($keyword !== '') {
            // PDO requires each named placeholder to be unique, so the same
            // keyword is bound twice under two different names
            $sql .= ' AND (m.name LIKE :kw_name OR m.category LIKE :kw_category)';
            $params[':kw_name'] = '%' . $keyword . '%';
            $params[':kw_category'] = '%' . $keyword . '%';
        }

        if ($category !== '') {
            $sql .= ' AND m.category = :category';
            $params[':category'] = $category;
        }

        if ($supplierId !== '' && ctype_digit((string) $supplierId)) {
            $sql .= ' AND m.supplier_id = :supplier_id';
            $params[':supplier_id'] = (int) $supplierId;
        }

        // Stock status uses the same three rules as the dashboard
        if ($status === 'out') {
            $sql .= ' AND m.stock_quantity = 0';
        } elseif ($status === 'low') {
            $sql .= ' AND m.stock_quantity > 0 AND m.stock_quantity <= m.min_threshold';
        } elseif ($status === 'healthy') {
            $sql .= ' AND m.stock_quantity > m.min_threshold';
        }

        $sql .= ' ORDER BY ' . $this->sortColumn($options['sort'] ?? 'name')
              . ' ' . (strtolower($options['direction'] ?? 'asc') === 'desc' ? 'DESC' : 'ASC');

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    // Translates a sort key from the URL into a real column name.
    // Anything unrecognised falls back to the name, so a tampered
    // URL can never inject SQL into the ORDER BY clause.
    private function sortColumn(string $sort): string
    {
        $allowed = [
            'name'     => 'm.name',
            'category' => 'm.category',
            'stock'    => 'm.stock_quantity',
            'cost'     => 'm.cost_per_unit',
            'supplier' => 's.name',
        ];
        return $allowed[$sort] ?? 'm.name';
    }

    // ============================================================
    // Grouped summaries used by the Categories page and reports
    // ============================================================

    // One row per category with its item count, total stock and value
    public function getCategoryStats(): array
    {
        $sql = 'SELECT category,
                       COUNT(*) AS item_count,
                       SUM(stock_quantity) AS total_stock,
                       COALESCE(SUM(stock_quantity * cost_per_unit), 0) AS total_value,
                       SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) AS out_count,
                       SUM(CASE WHEN stock_quantity > 0 AND stock_quantity <= min_threshold THEN 1 ELSE 0 END) AS low_count
                FROM materials
                GROUP BY category
                ORDER BY category ASC';
        return $this->db->query($sql)->fetchAll();
    }

    // One row per supplier with how many materials they supply.
    // Suppliers with no materials yet still appear, showing zero.
    public function getSupplierStats(): array
    {
        $sql = 'SELECT s.supplier_id, s.name, s.viber_contact, s.notes,
                       COUNT(m.material_id) AS item_count,
                       COALESCE(SUM(m.stock_quantity * m.cost_per_unit), 0) AS total_value,
                       SUM(CASE WHEN m.stock_quantity <= m.min_threshold THEN 1 ELSE 0 END) AS reorder_count
                FROM suppliers s
                LEFT JOIN materials m ON m.supplier_id = s.supplier_id
                GROUP BY s.supplier_id, s.name, s.viber_contact, s.notes
                ORDER BY s.name ASC';
        return $this->db->query($sql)->fetchAll();
    }

    // Every material with its value, used by the inventory value report.
    // Most valuable first so the biggest holdings are at the top.
    public function getValueReport(): array
    {
        $sql = 'SELECT m.*, s.name AS supplier_name,
                       (m.stock_quantity * m.cost_per_unit) AS total_value
                FROM materials m
                LEFT JOIN suppliers s ON m.supplier_id = s.supplier_id
                ORDER BY total_value DESC, m.name ASC';
        return $this->db->query($sql)->fetchAll();
    }
}
