<?php
// Base Model class
// Every model extends this so it has a ready-to-use PDO connection

class Model
{
    protected PDO $db;

    public function __construct()
    {
        $this->db = Database::connect();
    }
}
