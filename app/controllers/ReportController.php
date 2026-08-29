<?php
// Inventory reports. Four reports are available, each on its own route:
//   reports            -> full inventory report (filterable)
//   reports/lowstock   -> materials at or below threshold
//   reports/movement   -> stock movements for a date range
//   reports/value      -> inventory value by material
// General manager only, since every report exposes cost information.

class ReportController extends Controller
{
    public function __construct()
    {
        Auth::requireRole(['general_manager']);
    }

    // Full inventory report, filtered by category, supplier and stock status
    public function index()
    {
        $materialModel = $this->model('Material');
        $supplierModel = $this->model('Supplier');

        $category = trim($_GET['category'] ?? '');
        $status = $_GET['status'] ?? '';
        $supplierId = $_GET['supplier'] ?? '';

        $materials = $materialModel->getFiltered([
            'category' => $category,
            'status' => $status,
            'supplier_id' => $supplierId,
            'sort' => 'name',
            'direction' => 'asc',
        ]);

        // Totals for the summary strip at the top of the report
        $totalValue = 0;
        $totalUnits = 0;
        foreach ($materials as $material) {
            $totalValue += (float) $material['stock_quantity'] * (float) ($material['cost_per_unit'] ?? 0);
            $totalUnits += (int) $material['stock_quantity'];
        }

        $this->view('reports/inventory', [
            'materials' => $materials,
            'categories' => $materialModel->getCategories(),
            'suppliers' => $supplierModel->getAll(),
            'category' => $category,
            'status' => $status,
            'supplierId' => $supplierId,
            'totalValue' => $totalValue,
            'totalUnits' => $totalUnits,
        ]);
    }

    // Everything at or below its minimum threshold, worst first
    public function lowstock()
    {
        $materialModel = $this->model('Material');

        $this->view('reports/lowstock', [
            'materials' => $materialModel->getLowStock(),
            'outCount' => $materialModel->countStockOut(),
            'lowCount' => $materialModel->countLowOnly(),
        ]);
    }

    // Stock movements over a date range, optionally for one material or type
    public function movement()
    {
        $movementModel = $this->model('StockMovement');
        $materialModel = $this->model('Material');

        // Default range is the last 30 days, which covers a normal month
        $dateFrom = $_GET['from'] ?? date('Y-m-d', strtotime('-29 days'));
        $dateTo = $_GET['to'] ?? date('Y-m-d');
        $type = $_GET['type'] ?? '';
        $materialId = $_GET['material'] ?? '';

        $movements = $movementModel->getFiltered([
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'type' => $type,
            'material_id' => $materialId,
        ]);

        $totalIn = 0;
        $totalOut = 0;
        foreach ($movements as $movement) {
            if ($movement['type'] === 'in') {
                $totalIn += (int) $movement['quantity'];
            } else {
                $totalOut += (int) $movement['quantity'];
            }
        }

        $this->view('reports/movement', [
            'movements' => $movements,
            'materials' => $materialModel->getAll(),
            'dateFrom' => $dateFrom,
            'dateTo' => $dateTo,
            'type' => $type,
            'materialId' => $materialId,
            'totalIn' => $totalIn,
            'totalOut' => $totalOut,
        ]);
    }

    // What the stock on hand is worth, most valuable material first
    public function value()
    {
        $materialModel = $this->model('Material');
        $materials = $materialModel->getValueReport();

        $this->view('reports/value', [
            'materials' => $materials,
            'totalValue' => $materialModel->inventoryValue(),
            'categoryStats' => $materialModel->getCategoryStats(),
        ]);
    }
}
