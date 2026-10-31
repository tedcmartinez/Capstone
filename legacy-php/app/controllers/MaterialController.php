<?php
// Handles the materials catalog: list/search, create, edit, delete.
// Both roles can manage materials, but cost_per_unit, supplier_id, and
// min_threshold are general manager only fields, enforced below on the
// server (not just hidden in the view).

class MaterialController extends Controller
{
    public function __construct()
    {
        Auth::requireLogin();
    }

    public function index()
    {
        $materialModel = $this->model('Material');

        // Search box, filter dropdowns, and the sort chosen by clicking a
        // column header. All of them arrive in the query string.
        $keyword = trim($_GET['q'] ?? '');
        $category = trim($_GET['category'] ?? '');
        $status = $_GET['status'] ?? '';
        $supplierId = $_GET['supplier'] ?? '';
        $sort = $_GET['sort'] ?? 'name';
        $direction = ($_GET['dir'] ?? 'asc') === 'desc' ? 'desc' : 'asc';

        $materials = $materialModel->getFiltered([
            'keyword' => $keyword,
            'category' => $category,
            'status' => $status,
            'supplier_id' => $supplierId,
            'sort' => $sort,
            'direction' => $direction,
        ]);

        // Suppliers and categories are needed by the filter dropdowns and by
        // the edit modals that are embedded in the materials table
        $supplierModel = $this->model('Supplier');

        $this->view('materials/index', [
            'materials' => $materials,
            'keyword' => $keyword,
            'category' => $category,
            'status' => $status,
            'supplierId' => $supplierId,
            'sort' => $sort,
            'direction' => $direction,
            'suppliers' => $supplierModel->getAll(),
            'categories' => $materialModel->getCategories(),
        ]);
    }

    public function create()
    {
        $supplierModel = $this->model('Supplier');
        $suppliers = $supplierModel->getAll();
        $errors = [];

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $data = $this->validate($_POST, true, $errors);

            if (empty($errors)) {
                $materialModel = $this->model('Material');
                $materialModel->create($data);
                $this->redirect('materials');
                return;
            }
        }

        $this->view('materials/create', [
            'errors' => $errors,
            'suppliers' => $suppliers,
            'categories' => $this->model('Material')->getCategories(),
            'old' => $_POST,
        ]);
    }

    public function edit(?string $id = null)
    {
        // Only the general manager can edit materials. Staff logs stock
        // movements instead. Enforced server-side, not just hidden in the UI.
        Auth::requireRole(['general_manager']);

        if ($id === null || !ctype_digit($id)) {
            $this->redirect('materials');
            return;
        }

        $materialModel = $this->model('Material');
        $material = $materialModel->find((int) $id);
        if (!$material) {
            $this->redirect('materials');
            return;
        }

        $supplierModel = $this->model('Supplier');
        $suppliers = $supplierModel->getAll();
        $errors = [];

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            // Pass the existing record so fields the current role is not
            // allowed to change (min_threshold, cost_per_unit, supplier_id
            // for staff) keep their current value instead of being wiped out
            $data = $this->validate($_POST, false, $errors, $material);

            if (empty($errors)) {
                $materialModel->update((int) $id, $data);
                $this->redirect('materials');
                return;
            }
            // Keep what the user typed visible on the form when validation fails
            $material = array_merge($material, $_POST);
        }

        $this->view('materials/edit', [
            'errors' => $errors,
            'material' => $material,
            'suppliers' => $suppliers,
            'categories' => $materialModel->getCategories(),
        ]);
    }

    public function delete(?string $id = null)
    {
        // Only the general manager can delete materials. This is enforced
        // here on the server, not just by hiding the button in the view.
        Auth::requireRole(['general_manager']);

        if ($_SERVER['REQUEST_METHOD'] === 'POST' && $id !== null && ctype_digit($id)) {
            $materialModel = $this->model('Material');
            $materialModel->delete((int) $id);
        }
        $this->redirect('materials');
    }

    // Validates the submitted fields and builds the data array used to
    // create or update a material. $existing supplies fallback values for
    // GM-only fields when the current user is production staff.
    private function validate(array $post, bool $isCreate, array &$errors, array $existing = []): array
    {
        $name = trim($post['name'] ?? '');
        $category = trim($post['category'] ?? '');
        $size = trim($post['size'] ?? '');
        $unit = trim($post['unit'] ?? '');
        $notes = trim($post['notes'] ?? '');

        if ($name === '') {
            $errors[] = 'Material name is required.';
        }
        if ($category === '') {
            $errors[] = 'Category is required.';
        }
        if ($unit === '') {
            $errors[] = 'Unit is required.';
        }

        $data = [
            'name' => $name,
            'category' => $category,
            'size' => $size,
            'unit' => $unit,
            'notes' => $notes,
            'min_threshold' => $existing['min_threshold'] ?? 0,
            'cost_per_unit' => $existing['cost_per_unit'] ?? null,
            'supplier_id' => $existing['supplier_id'] ?? null,
        ];

        if ($isCreate) {
            $stockQuantity = $post['stock_quantity'] ?? '';
            if ($stockQuantity === '' || !ctype_digit((string) $stockQuantity) || (int) $stockQuantity < 0) {
                $errors[] = 'Opening stock quantity must be a whole number that is zero or more.';
                $data['stock_quantity'] = 0;
            } else {
                $data['stock_quantity'] = (int) $stockQuantity;
            }
        }

        // cost_per_unit, supplier_id, and min_threshold can only be set by
        // the general manager. Production staff requests never reach here,
        // so these fields silently keep their existing/default value above.
        if (Auth::role() === 'general_manager') {
            $minThreshold = $post['min_threshold'] ?? '';
            if ($minThreshold === '' || !ctype_digit((string) $minThreshold) || (int) $minThreshold < 0) {
                $errors[] = 'Minimum threshold must be a whole number that is zero or more.';
            } else {
                $data['min_threshold'] = (int) $minThreshold;
            }

            $costPerUnit = $post['cost_per_unit'] ?? '';
            if ($costPerUnit !== '' && !is_numeric($costPerUnit)) {
                $errors[] = 'Cost per unit must be a valid number.';
            } else {
                $data['cost_per_unit'] = $costPerUnit !== '' ? (float) $costPerUnit : null;
            }

            $supplierId = $post['supplier_id'] ?? '';
            $data['supplier_id'] = ($supplierId !== '' && ctype_digit((string) $supplierId)) ? (int) $supplierId : null;
        }

        return $data;
    }
}
