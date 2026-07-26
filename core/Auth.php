<?php
// Session-based authentication helper
// Used by every controller to check who is logged in and enforce roles

class Auth
{
    // Stores the logged-in user's data in the session after a successful login
    public static function login(array $user): void
    {
        $_SESSION['user_id'] = $user['user_id'];
        $_SESSION['name'] = $user['name'];
        $_SESSION['email'] = $user['email'];
        $_SESSION['role'] = $user['role'];
    }

    // Clears the session, logging the current user out
    public static function logout(): void
    {
        $_SESSION = [];
        session_destroy();
    }

    public static function check(): bool
    {
        return isset($_SESSION['user_id']);
    }

    public static function role(): ?string
    {
        return $_SESSION['role'] ?? null;
    }

    public static function id(): ?int
    {
        return $_SESSION['user_id'] ?? null;
    }

    public static function name(): ?string
    {
        return $_SESSION['name'] ?? null;
    }

    // Redirects to the login page if nobody is signed in.
    // Call this at the top of any controller that requires a logged-in user.
    public static function requireLogin(): void
    {
        if (!self::check()) {
            header('Location: ' . BASE_URL . 'login');
            exit;
        }
    }

    // Stops the request with a 403 page if the logged-in user's role is not
    // in the allowed list. This is the server-side enforcement of role-based
    // access control, it does not rely on the UI hiding links.
    public static function requireRole(array $allowedRoles): void
    {
        self::requireLogin();
        if (!in_array(self::role(), $allowedRoles, true)) {
            http_response_code(403);
            require ROOT_PATH . '/app/views/layouts/header.php';
            require ROOT_PATH . '/app/views/errors/403.php';
            require ROOT_PATH . '/app/views/layouts/footer.php';
            exit;
        }
    }
}
