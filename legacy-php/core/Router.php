<?php
// Simple front controller / router
// Reads the 'url' query string set by .htaccess and dispatches the request
// to the matching controller class and action method

class Router
{
    // Maps the first URL segment to a controller class and its default action
    private array $routes = [
        'dashboard'  => ['controller' => 'DashboardController', 'default' => 'index'],
        'login'      => ['controller' => 'AuthController', 'default' => 'login'],
        'logout'     => ['controller' => 'AuthController', 'default' => 'logout'],
        'materials'  => ['controller' => 'MaterialController', 'default' => 'index'],
        'movements'  => ['controller' => 'MovementController', 'default' => 'index'],
        'checklist'  => ['controller' => 'ChecklistController', 'default' => 'index'],
        'users'      => ['controller' => 'UserController', 'default' => 'index'],
        'categories' => ['controller' => 'CategoryController', 'default' => 'index'],
        'suppliers'  => ['controller' => 'SupplierController', 'default' => 'index'],
        'reports'    => ['controller' => 'ReportController', 'default' => 'index'],
        'settings'   => ['controller' => 'SettingsController', 'default' => 'index'],
    ];

    public function dispatch()
    {
        $url = trim($_GET['url'] ?? '', '/');
        $segments = $url === '' ? [] : explode('/', $url);
        $controllerKey = $segments[0] ?? '';

        // Root URL: send the visitor to the right landing page based on role,
        // or to the login page if nobody is signed in
        if ($controllerKey === '') {
            if (!Auth::check()) {
                header('Location: ' . BASE_URL . 'login');
            } elseif (Auth::role() === 'general_manager') {
                header('Location: ' . BASE_URL . 'dashboard');
            } else {
                header('Location: ' . BASE_URL . 'materials');
            }
            exit;
        }

        if (!array_key_exists($controllerKey, $this->routes)) {
            $this->show404();
            return;
        }

        $route = $this->routes[$controllerKey];
        $controllerName = $route['controller'];
        $actionSegment = $segments[1] ?? '';
        $action = $actionSegment !== '' ? $actionSegment : $route['default'];
        $params = array_slice($segments, 2);

        $controllerFile = ROOT_PATH . '/app/controllers/' . $controllerName . '.php';
        if (!file_exists($controllerFile)) {
            $this->show404();
            return;
        }
        require_once $controllerFile;

        if (!class_exists($controllerName) || !method_exists($controllerName, $action)) {
            $this->show404();
            return;
        }

        $controller = new $controllerName();
        call_user_func_array([$controller, $action], $params);
    }

    private function show404()
    {
        http_response_code(404);
        require ROOT_PATH . '/app/views/layouts/header.php';
        require ROOT_PATH . '/app/views/errors/404.php';
        require ROOT_PATH . '/app/views/layouts/footer.php';
    }
}
