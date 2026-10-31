<?php
// Base Controller class
// Every controller extends this so it can load models and render views

class Controller
{
    // Loads a model class by name (e.g. "Material") and returns a new instance
    public function model(string $modelName)
    {
        require_once ROOT_PATH . '/app/models/' . $modelName . '.php';
        return new $modelName();
    }

    // Renders a view inside the shared header/footer layout
    public function view(string $viewPath, array $data = [])
    {
        extract($data);
        $viewFile = ROOT_PATH . '/app/views/' . $viewPath . '.php';
        if (!file_exists($viewFile)) {
            die('View not found: ' . $viewPath);
        }
        require ROOT_PATH . '/app/views/layouts/header.php';
        require $viewFile;
        require ROOT_PATH . '/app/views/layouts/footer.php';
    }

    // Renders a view with no shared layout (used for the standalone login page)
    public function viewPlain(string $viewPath, array $data = [])
    {
        extract($data);
        $viewFile = ROOT_PATH . '/app/views/' . $viewPath . '.php';
        if (!file_exists($viewFile)) {
            die('View not found: ' . $viewPath);
        }
        require $viewFile;
    }

    // Redirects the browser to another route within the app
    public function redirect(string $path)
    {
        header('Location: ' . BASE_URL . ltrim($path, '/'));
        exit;
    }
}
