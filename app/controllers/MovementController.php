<?php
// Handles stock-in and stock-out logging, and the movement history page.
// Both roles can log movements, this is the day-to-day production floor task.

class MovementController extends Controller
{
    public function __construct()
    {
        Auth::requireLogin();
    }

    // Movement history: sortable table of every stock-in / stock-out entry
    public function index()
    {
        $movementModel = $this->model('StockMovement');
        $movements = $movementModel->getAll();

        $sort = $_GET['sort'] ?? 'movement_date';
        $direction = ($_GET['dir'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $movements = $this->sortMovements($movements, $sort, $direction);

        $this->view('movements/index', [
            'movements' => $movements,
            'sort' => $sort,
            'direction' => $direction,
        ]);
    }

    public function stockin()
    {
        $this->logMovement('in');
    }

    public function stockout()
    {
        $this->logMovement('out');
    }

    private function logMovement(string $type)
    {
        $materialModel = $this->model('Material');
        $materials = $materialModel->getAll();
        $errors = [];

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $materialId = $_POST['material_id'] ?? '';
            $quantity = $_POST['quantity'] ?? '';

            // Reason and reference are combined into the existing notes
            // column, e.g. "Purchase | Ref: PO-1042 | delivered late".
            // Keeping them in one field means no database change was needed
            // and every movement already recorded stays readable.
            $notes = $this->buildNotes($type, $_POST);

            // The movement date is always set by the server to today.
            // It is not taken from the form, so it cannot be changed or
            // backdated by the user.
            $date = date('Y-m-d');

            if ($materialId === '' || !ctype_digit((string) $materialId)) {
                $errors[] = 'Please select a material.';
            }
            if ($quantity === '' || !ctype_digit((string) $quantity) || (int) $quantity <= 0) {
                $errors[] = 'Quantity must be a whole number greater than zero.';
            }

            // Optional receipt upload, stock-in only. Validated and saved
            // before the movement row so the filename can be stored with it.
            $receiptFile = null;
            if ($type === 'in' && !empty($_FILES['receipt']['name'])) {
                $receiptFile = $this->saveReceipt($_FILES['receipt'], $errors);
            }

            $material = null;
            if (empty($errors)) {
                $material = $materialModel->find((int) $materialId);
                if (!$material) {
                    $errors[] = 'Selected material no longer exists.';
                } elseif ($type === 'out' && (int) $quantity > (int) $material['stock_quantity']) {
                    $errors[] = 'Cannot remove more than the ' . $material['stock_quantity'] . ' ' . $material['unit'] . ' currently in stock.';
                }
            }

            if (empty($errors)) {
                $movementModel = $this->model('StockMovement');
                $movementModel->create([
                    'material_id' => (int) $materialId,
                    'type' => $type,
                    'quantity' => (int) $quantity,
                    'movement_date' => $date,
                    'logged_by' => Auth::id(),
                    'notes' => $notes,
                    'receipt_file' => $receiptFile,
                ]);

                // Stock-in adds to the running total, stock-out subtracts
                $adjustment = $type === 'in' ? (int) $quantity : -(int) $quantity;
                $materialModel->adjustStock((int) $materialId, $adjustment);

                // After a stock-out, immediately check the threshold and
                // send any low-stock / stock-out alert emails that are due
                if ($type === 'out') {
                    $updatedMaterial = $materialModel->find((int) $materialId);
                    $notificationModel = $this->model('Notification');
                    $notificationModel->checkAndNotify($updatedMaterial);
                }

                $this->redirect('movements');
                return;
            }
        }

        $this->view('movements/' . ($type === 'in' ? 'stockin' : 'stockout'), [
            'materials' => $materials,
            'errors' => $errors,
        ]);
    }

    // Joins the reason dropdown, the reference / project box, and the free
    // text notes into the single notes column that the database already has.
    // Only the parts the user actually filled in are included.
    private function buildNotes(string $type, array $post): string
    {
        $parts = [];

        $reason = trim($post['reason'] ?? '');
        if ($reason !== '' && in_array($reason, $this->allowedReasons($type), true)) {
            $parts[] = $reason;
        }

        $reference = trim($post['reference'] ?? '');
        if ($reference !== '') {
            // Stock-in references a purchase document, stock-out a project
            $parts[] = ($type === 'in' ? 'Ref: ' : 'Project: ') . $reference;
        }

        $notes = trim($post['notes'] ?? '');
        if ($notes !== '') {
            $parts[] = $notes;
        }

        return implode(' | ', $parts);
    }

    // The reason options each form is allowed to submit. Anything else is
    // ignored, so a hand-edited form cannot store arbitrary text here.
    private function allowedReasons(string $type): array
    {
        if ($type === 'in') {
            return ['Purchase', 'Restock', 'Return', 'Correction'];
        }
        return ['Project Usage', 'Damaged', 'Transfer', 'Other'];
    }

    // Validates and stores an uploaded receipt image.
    // Returns the saved filename, or null (with an error added) if invalid.
    // Only image files are accepted and the type is checked by content,
    // not just the file extension, so a renamed .exe cannot slip through.
    private function saveReceipt(array $file, array &$errors): ?string
    {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            $errors[] = 'The receipt file failed to upload. Please try again.';
            return null;
        }

        if ($file['size'] > 5 * 1024 * 1024) {
            $errors[] = 'Receipt file is too large. Maximum size is 5 MB.';
            return null;
        }

        // Check the real content type of the file
        $allowed = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
        ];
        $mime = mime_content_type($file['tmp_name']);
        if (!isset($allowed[$mime])) {
            $errors[] = 'Receipt must be a JPG, PNG, or WEBP image.';
            return null;
        }

        // Random filename so uploads can never overwrite each other
        $filename = 'receipt_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $allowed[$mime];
        $destination = ROOT_PATH . '/public/uploads/receipts/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            $errors[] = 'Could not save the receipt file on the server.';
            return null;
        }

        return $filename;
    }

    // Sorts the in-memory movement list by the requested column. The list
    // is small enough for a single furniture shop that this is simpler
    // than building dynamic ORDER BY SQL.
    private function sortMovements(array $movements, string $sort, string $direction): array
    {
        $allowedSorts = ['material_name', 'type', 'quantity', 'movement_date', 'logged_by_name'];
        if (!in_array($sort, $allowedSorts, true)) {
            $sort = 'movement_date';
        }
        usort($movements, fn($a, $b) => $a[$sort] <=> $b[$sort]);
        if ($direction === 'desc') {
            $movements = array_reverse($movements);
        }
        return $movements;
    }
}
