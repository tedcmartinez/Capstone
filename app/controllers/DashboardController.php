<?php
// GM dashboard: summary counts, inventory health, low-stock highlights,
// recent activity, and the stock movement chart.
// General manager only.

class DashboardController extends Controller
{
    public function __construct()
    {
        Auth::requireRole(['general_manager']);
    }

    public function index()
    {
        $materialModel = $this->model('Material');
        $movementModel = $this->model('StockMovement');

        // The three health states always add up to the total catalog count
        $healthy = $materialModel->countHealthy();
        $low = $materialModel->countLowOnly();
        $out = $materialModel->countStockOut();

        $this->view('dashboard/index', [
            'totalMaterials' => $materialModel->countAll(),
            'lowStockCount' => $materialModel->countLowStock(),
            'stockOutCount' => $out,
            'healthyCount' => $healthy,
            'lowOnlyCount' => $low,
            'inventoryValue' => $materialModel->inventoryValue(),
            'lowStockMaterials' => $materialModel->getLowStock(),
            'recentMovements' => $movementModel->getRecent(8),
            // 30 days is the usual reporting window for the shop, and it is
            // wide enough that the chart still shows something during a
            // quiet week
            'chartSeries' => $movementModel->getDailyTotals(30),
        ]);
    }
}
