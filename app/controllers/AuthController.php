<?php
// Handles login and logout. No role is required to reach these actions,
// everyone needs to be able to see the login page.

class AuthController extends Controller
{
    // Shows the login form (GET) and processes the login attempt (POST)
    public function login()
    {
        // If already logged in, skip the form and go straight to the landing page
        if (Auth::check()) {
            $this->redirectToLanding();
            return;
        }

        $errors = [];

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $email = trim($_POST['email'] ?? '');
            $password = $_POST['password'] ?? '';

            if ($email === '' || $password === '') {
                $errors[] = 'Email and password are required.';
            } else {
                $userModel = $this->model('User');
                $user = $userModel->findByEmail($email);

                if (!$user || !password_verify($password, $user['password_hash'])) {
                    $errors[] = 'Invalid email or password.';
                } elseif ((int) $user['is_active'] === 0) {
                    $errors[] = 'This account has been deactivated. Contact the general manager.';
                } else {
                    Auth::login($user);
                    $this->redirectToLanding();
                    return;
                }
            }
        }

        $this->viewPlain('auth/login', ['errors' => $errors, 'old' => $_POST]);
    }

    public function logout()
    {
        Auth::logout();
        $this->redirect('login');
    }

    // Sends general managers to the dashboard and staff to the materials
    // catalog, since the dashboard is a GM-only page
    private function redirectToLanding()
    {
        if (Auth::role() === 'general_manager') {
            $this->redirect('dashboard');
        } else {
            $this->redirect('materials');
        }
    }
}
