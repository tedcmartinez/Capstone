<?php
// Suppliers list: every supplier with the number of materials they supply
// and how many of those currently need reordering.
// General manager only, because supplier and cost information is a
// management concern (the same rule the materials catalog follows).

class SupplierController extends Controller
{
    public function __construct()
    {
        Auth::requireRole(['general_manager']);
    }

    public function index()
    {
        $materialModel = $this->model('Material');

        $this->view('suppliers/index', [
            'supplierStats' => $materialModel->getSupplierStats(),
        ]);
    }
}
