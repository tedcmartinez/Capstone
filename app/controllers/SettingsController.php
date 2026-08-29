<?php
// Settings: a read-only summary of how the system is configured.
// It gathers the values that a panel or a new manager would ask about
// (email alerts, thresholds, roles) into one page instead of leaving them
// buried in config files. Nothing here is editable, so there is no risk
// of the live SMTP settings being changed from a browser.

class SettingsController extends Controller
{
    public function __construct()
    {
        Auth::requireRole(['general_manager']);
    }

    public function index()
    {
        $materialModel = $this->model('Material');
        $userModel = $this->model('User');

        // Read the mail settings without ever exposing the password
        $emailConfig = require ROOT_PATH . '/config/email.config.php';

        $this->view('settings/index', [
            'emailFrom' => $emailConfig['from_email'] ?? '',
            'emailHost' => $emailConfig['host'] ?? '',
            'emailPort' => $emailConfig['port'] ?? '',
            'emailUser' => $emailConfig['username'] ?? '',
            'totalMaterials' => $materialModel->countAll(),
            'lowStockCount' => $materialModel->countLowStock(),
            'users' => $userModel->getAll(),
        ]);
    }
}
