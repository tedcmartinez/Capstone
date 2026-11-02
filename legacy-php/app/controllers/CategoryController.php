<?php
// Categories overview: shows every material category with its item count,
// stock total, and how many items in it need reordering.
// Categories are stored as a text field on each material rather than in
// their own table, so this page reads them by grouping the catalog.

class CategoryController extends Controller
{
    public function __construct()
    {
        Auth::requireLogin();
    }

    public function index()
    {
        $materialModel = $this->model('Material');

        $this->view('categories/index', [
            'categoryStats' => $materialModel->getCategoryStats(),
        ]);
    }
}
