<?php
// Reorder checklist of materials at or below their minimum threshold.
// General manager only. The checklist is a live query, so a material
// drops off automatically as soon as a stock-in takes it above threshold.
// The GM can email the checklist to chosen recipients as a styled report.

class ChecklistController extends Controller
{
    public function __construct()
    {
        Auth::requireRole(['general_manager']);
    }

    public function index()
    {
        $materialModel = $this->model('Material');
        $userModel = $this->model('User');

        // Only active accounts are offered as recipients
        $activeUsers = array_filter($userModel->getAll(), fn($u) => (int) $u['is_active'] === 1);

        $this->view('checklist/index', [
            'lowStockMaterials' => $materialModel->getLowStock(),
            'activeUsers' => $activeUsers,
            'sent' => $_GET['sent'] ?? null,
            'failed' => $_GET['failed'] ?? null,
        ]);
    }

    // Emails the current reorder checklist to the selected recipients
    public function send()
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $this->redirect('checklist');
            return;
        }

        $materialModel = $this->model('Material');
        $lowStock = $materialModel->getLowStock();
        if (empty($lowStock)) {
            $this->redirect('checklist');
            return;
        }

        // Collect recipients: checked user accounts plus an optional extra address
        $recipients = [];
        $userModel = $this->model('User');
        foreach ($_POST['recipients'] ?? [] as $userId) {
            if (ctype_digit((string) $userId)) {
                $user = $userModel->find((int) $userId);
                if ($user && (int) $user['is_active'] === 1) {
                    $recipients[] = $user['email'];
                }
            }
        }
        $extra = trim($_POST['extra_email'] ?? '');
        if ($extra !== '' && filter_var($extra, FILTER_VALIDATE_EMAIL)) {
            $recipients[] = $extra;
        }
        $recipients = array_unique($recipients);

        if (empty($recipients)) {
            $this->redirect('checklist');
            return;
        }

        $body = $this->buildChecklistEmail($lowStock);
        $subject = 'Reorder Checklist - ' . date('F j, Y');

        $sent = 0;
        $failed = 0;
        foreach ($recipients as $email) {
            if (Mailer::send($email, $subject, $body)) {
                $sent++;
            } else {
                $failed++;
            }
        }

        $this->redirect('checklist?sent=' . $sent . '&failed=' . $failed);
    }

    // Builds the checklist as a styled HTML email in the Cornerblock brand
    // colors. Inline styles only, because email apps ignore stylesheets.
    private function buildChecklistEmail(array $materials): string
    {
        $rows = '';
        foreach ($materials as $m) {
            $rows .= '<tr>'
                . '<td style="padding:10px 14px;border-bottom:1px solid #c5b9af;color:#0e0808;">' . htmlspecialchars($m['name']) . '</td>'
                . '<td style="padding:10px 14px;border-bottom:1px solid #c5b9af;text-align:center;color:#a04b1a;font-weight:bold;">' . (int) $m['stock_quantity'] . '</td>'
                . '<td style="padding:10px 14px;border-bottom:1px solid #c5b9af;text-align:center;color:#0e0808;">' . htmlspecialchars($m['unit']) . '</td>'
                . '<td style="padding:10px 14px;border-bottom:1px solid #c5b9af;text-align:center;color:#0e0808;">' . (int) $m['min_threshold'] . '</td>'
                . '<td style="padding:10px 14px;border-bottom:1px solid #c5b9af;color:#0e0808;">' . htmlspecialchars($m['supplier_name'] ?? '-') . '</td>'
                . '</tr>';
        }

        return '
        <div style="background-color:#f4f0eb;padding:24px;font-family:Arial,Helvetica,sans-serif;">
            <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #c5b9af;">
                <div style="background-color:#412118;padding:20px 24px;">
                    <span style="color:#a04b1a;font-size:24px;font-weight:bold;letter-spacing:0.5px;">Cornerblock</span>
                    <span style="color:#c5b9af;font-size:13px;display:block;margin-top:2px;">Materials Inventory Management System</span>
                </div>
                <div style="padding:24px;">
                    <h2 style="color:#412118;margin:0 0 4px 0;">Reorder Checklist</h2>
                    <p style="color:#7f6753;margin:0 0 18px 0;font-size:13px;">Generated on ' . date('F j, Y \a\t g:i A') . ' &middot; ' . count($materials) . ' material(s) need reordering</p>
                    <table style="border-collapse:collapse;width:100%;font-size:14px;">
                        <tr style="background-color:#412118;">
                            <th style="padding:10px 14px;color:#ffffff;text-align:left;">Material</th>
                            <th style="padding:10px 14px;color:#ffffff;text-align:center;">Current</th>
                            <th style="padding:10px 14px;color:#ffffff;text-align:center;">Unit</th>
                            <th style="padding:10px 14px;color:#ffffff;text-align:center;">Threshold</th>
                            <th style="padding:10px 14px;color:#ffffff;text-align:left;">Supplier</th>
                        </tr>
                        ' . $rows . '
                    </table>
                    <p style="color:#7f6753;font-size:12px;margin:18px 0 0 0;">
                        This is an automated report from the Cornerblock Materials Inventory System.
                        Materials leave this list automatically once restocked above their threshold.
                    </p>
                </div>
            </div>
        </div>';
    }
}
