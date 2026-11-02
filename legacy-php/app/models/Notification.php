<?php
// Notification model
// Decides when low-stock / stock-out alert emails should be sent, sends them
// through Mailer, and records every attempt in notification_log

require_once __DIR__ . '/User.php';

class Notification extends Model
{
    // Checks notification_log for a successfully sent alert of the same
    // trigger_type for the same material within the last 24 hours.
    // This is the deduplication rule: if true, sending should be skipped.
    public function wasSentRecently(int $materialId, string $triggerType): bool
    {
        $sql = 'SELECT COUNT(*) FROM notification_log
                WHERE material_id = :material_id
                  AND trigger_type = :trigger_type
                  AND status = "sent"
                  AND timestamp >= (NOW() - INTERVAL 24 HOUR)';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([':material_id' => $materialId, ':trigger_type' => $triggerType]);
        return (int) $stmt->fetchColumn() > 0;
    }

    public function logAttempt(int $materialId, string $triggerType, string $recipientEmail, string $status): void
    {
        $sql = 'INSERT INTO notification_log (material_id, trigger_type, channel, recipient_email, status)
                VALUES (:material_id, :trigger_type, "email", :recipient_email, :status)';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            ':material_id' => $materialId,
            ':trigger_type' => $triggerType,
            ':recipient_email' => $recipientEmail,
            ':status' => $status,
        ]);
    }

    // Main entry point, called right after a stock-out movement is saved.
    // Checks the material's current stock level and fires the right alerts.
    public function checkAndNotify(array $material): void
    {
        $materialId = (int) $material['material_id'];
        $stockQuantity = (int) $material['stock_quantity'];
        $minThreshold = (int) $material['min_threshold'];

        $userModel = new User();

        // Low-stock alert: goes to both production staff and the general manager
        if ($stockQuantity <= $minThreshold && !$this->wasSentRecently($materialId, 'low-stock')) {
            $recipients = array_merge(
                $userModel->getActiveEmailsByRole('production_staff'),
                $userModel->getActiveEmailsByRole('general_manager')
            );
            $this->sendAlert($material, 'low-stock', $recipients);
        }

        // Stock-out alert: goes only to the general manager
        if ($stockQuantity === 0 && !$this->wasSentRecently($materialId, 'stock-out')) {
            $recipients = $userModel->getActiveEmailsByRole('general_manager');
            $this->sendAlert($material, 'stock-out', $recipients);
        }
    }

    private function sendAlert(array $material, string $triggerType, array $recipients): void
    {
        $title = $triggerType === 'stock-out' ? 'Stock-Out Alert' : 'Low-Stock Alert';
        $subject = $title . ': ' . $material['name'];
        $body = $this->buildAlertEmail($material, $title);

        foreach ($recipients as $email) {
            $sent = Mailer::send($email, $subject, $body);
            $this->logAttempt((int) $material['material_id'], $triggerType, $email, $sent ? 'sent' : 'failed');
        }
    }

    // Builds the alert as a styled HTML email in the same Cornerblock brand
    // layout as the reorder checklist email (dark header banner, white card,
    // inline styles only since email apps ignore stylesheets).
    private function buildAlertEmail(array $material, string $title): string
    {
        return '
        <div style="background-color:#f4f0eb;padding:24px;font-family:Arial,Helvetica,sans-serif;">
            <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #c5b9af;">
                <div style="background-color:#412118;padding:20px 24px;">
                    <span style="color:#a04b1a;font-size:24px;font-weight:bold;letter-spacing:0.5px;">Cornerblock</span>
                    <span style="color:#c5b9af;font-size:13px;display:block;margin-top:2px;">Materials Inventory Management System</span>
                </div>
                <div style="padding:24px;">
                    <h2 style="color:#412118;margin:0 0 4px 0;">' . $title . '</h2>
                    <p style="color:#7f6753;margin:0 0 18px 0;font-size:13px;">' . date('F j, Y \a\t g:i A') . '</p>
                    <table style="border-collapse:collapse;width:100%;font-size:14px;">
                        <tr>
                            <td style="padding:10px 14px;border-bottom:1px solid #c5b9af;color:#0e0808;font-weight:bold;">Material</td>
                            <td style="padding:10px 14px;border-bottom:1px solid #c5b9af;color:#0e0808;">' . htmlspecialchars($material['name']) . '</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 14px;border-bottom:1px solid #c5b9af;color:#0e0808;font-weight:bold;">Current stock</td>
                            <td style="padding:10px 14px;border-bottom:1px solid #c5b9af;color:#a04b1a;font-weight:bold;">' . (int) $material['stock_quantity'] . ' ' . htmlspecialchars($material['unit']) . '</td>
                        </tr>
                        <tr>
                            <td style="padding:10px 14px;color:#0e0808;font-weight:bold;">Minimum threshold</td>
                            <td style="padding:10px 14px;color:#0e0808;">' . (int) $material['min_threshold'] . ' ' . htmlspecialchars($material['unit']) . '</td>
                        </tr>
                    </table>
                    <p style="color:#7f6753;font-size:12px;margin:18px 0 0 0;">
                        This is an automated message from the Cornerblock Materials Inventory System.
                    </p>
                </div>
            </div>
        </div>';
    }
}
