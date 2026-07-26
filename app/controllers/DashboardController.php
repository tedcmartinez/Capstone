<?php
// GM dashboard: summary counts, low-stock highlights, and recent activity.
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

        $this->view('dashboard/index', [
            'totalMaterials' => $materialModel->countAll(),
            'lowStockCount' => $materialModel->countLowStock(),
            'stockOutCount' => $materialModel->countStockOut(),
            'lowStockMaterials' => $materialModel->getLowStock(),
            'recentMovements' => $movementModel->getRecent(10),
        ]);
    }
}
