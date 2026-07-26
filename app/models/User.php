<?php
// User model
// Handles all database access for production_staff and general_manager accounts

class User extends Model
{
    public function findByEmail(string $email): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE email = :email');
        $stmt->execute([':email' => $email]);
        $result = $stmt->fetch();
        return $result ?: null;
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM users WHERE user_id = :id');
        $stmt->execute([':id' => $id]);
        $result = $stmt->fetch();
        return $result ?: null;
    }

    public function getAll(): array
    {
        return $this->db->query('SELECT * FROM users ORDER BY name ASC')->fetchAll();
    }

    public function create(array $data): int
    {
        $sql = 'INSERT INTO users (name, role, email, password_hash, is_active)
                VALUES (:name, :role, :email, :password_hash, 1)';
        $stmt = $this->db->prepare($sql);
        $stmt->execute([
            ':name' => $data['name'],
            ':role' => $data['role'],
            ':email' => $data['email'],
            ':password_hash' => $data['password_hash'],
        ]);
        return (int) $this->db->lastInsertId();
    }

    // Flips is_active between 0 and 1. There is no delete, accounts are
    // only ever deactivated or reactivated so movement history stays intact.
    public function toggleActive(int $id): bool
    {
        $stmt = $this->db->prepare('UPDATE users SET is_active = NOT is_active WHERE user_id = :id');
        return $stmt->execute([':id' => $id]);
    }

    // Returns the email addresses of active accounts with the given role,
    // used to decide who receives low-stock and stock-out alert emails
    public function getActiveEmailsByRole(string $role): array
    {
        $stmt = $this->db->prepare('SELECT email FROM users WHERE role = :role AND is_active = 1');
        $stmt->execute([':role' => $role]);
        return array_column($stmt->fetchAll(), 'email');
    }
}
