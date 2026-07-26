-- Cornerblock Trading Inc. Materials Inventory Management System
-- Database schema
-- Run this file first, then seed.sql

CREATE DATABASE IF NOT EXISTS cornerblock_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE cornerblock_db;

-- users table
-- Stores both production staff and general manager accounts
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role ENUM('production_staff','general_manager') NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- suppliers table
-- Stores supplier contact info used on the reorder checklist
CREATE TABLE suppliers (
    supplier_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    viber_contact VARCHAR(20),
    notes TEXT
) ENGINE=InnoDB;

-- materials table
-- The main catalog of raw materials tracked in inventory
CREATE TABLE materials (
    material_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    size VARCHAR(50),
    unit VARCHAR(20) NOT NULL,
    stock_quantity INT NOT NULL DEFAULT 0,
    min_threshold INT NOT NULL DEFAULT 0,
    cost_per_unit DECIMAL(10,2) DEFAULT NULL,
    supplier_id INT DEFAULT NULL,
    notes TEXT,
    CONSTRAINT fk_materials_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

-- stock_movements table
-- Every individual stock-in or stock-out transaction is logged here
CREATE TABLE stock_movements (
    movement_id INT AUTO_INCREMENT PRIMARY KEY,
    material_id INT NOT NULL,
    type ENUM('in','out') NOT NULL,
    quantity INT NOT NULL,
    movement_date DATE NOT NULL,
    logged_by INT NOT NULL,
    notes TEXT,
    receipt_file VARCHAR(255) DEFAULT NULL, -- uploaded receipt photo for stock-in entries
    CONSTRAINT fk_movements_material
        FOREIGN KEY (material_id) REFERENCES materials(material_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_movements_user
        FOREIGN KEY (logged_by) REFERENCES users(user_id)
) ENGINE=InnoDB;

-- notification_log table
-- Records every email alert attempt so we can deduplicate within 24 hours
CREATE TABLE notification_log (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    material_id INT NOT NULL,
    trigger_type ENUM('low-stock','stock-out') NOT NULL,
    channel VARCHAR(10) NOT NULL DEFAULT 'email',
    recipient_email VARCHAR(100) NOT NULL,
    status ENUM('sent','failed') NOT NULL,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_material
        FOREIGN KEY (material_id) REFERENCES materials(material_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- Helpful indexes for lookups used throughout the app
CREATE INDEX idx_materials_name ON materials(name);
CREATE INDEX idx_materials_category ON materials(category);
CREATE INDEX idx_movements_material ON stock_movements(material_id);
CREATE INDEX idx_movements_date ON stock_movements(movement_date);
CREATE INDEX idx_notification_lookup ON notification_log(material_id, trigger_type, timestamp);
