<?php
// User account management: list accounts, create staff accounts, and
// toggle accounts active/inactive. General manager only.

class UserController extends Controller
{
    public function __construct()
    {
        Auth::requireRole(['general_manager']);
    }

    public function index()
    {
        $userModel = $this->model('User');
        $this->view('users/index', [
            'users' => $userModel->getAll(),
        ]);
    }

    public function create()
    {
        $errors = [];

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $name = trim($_POST['name'] ?? '');
            $email = trim($_POST['email'] ?? '');
            $role = $_POST['role'] ?? '';
            $password = $_POST['password'] ?? '';

            if ($name === '') {
                $errors[] = 'Name is required.';
            }
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $errors[] = 'A valid email address is required.';
            }
            if (!in_array($role, ['production_staff', 'general_manager'], true)) {
                $errors[] = 'Please select a valid role.';
            }
            if (strlen($password) < 8) {
                $errors[] = 'Password must be at least 8 characters long.';
            }

            $userModel = $this->model('User');
            if (empty($errors) && $userModel->findByEmail($email)) {
                $errors[] = 'An account with that email already exists.';
            }

            if (empty($errors)) {
                $userModel->create([
                    'name' => $name,
                    'email' => $email,
                    'role' => $role,
                    'password_hash' => password_hash($password, PASSWORD_BCRYPT),
                ]);
                $this->redirect('users');
                return;
            }
        }

        $this->view('users/create', ['errors' => $errors]);
    }

    public function toggle(?string $id = null)
    {
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && $id !== null && ctype_digit($id)) {
            $userModel = $this->model('User');
            $userModel->toggleActive((int) $id);
        }
        $this->redirect('users');
    }
}
