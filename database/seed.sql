-- Cornerblock Trading Inc. Materials Inventory Management System
-- Sample seed data for immediate testing
-- Run schema.sql first, then this file

USE cornerblock_db;

-- Suppliers (fictional Antipolo, Rizal based suppliers)
INSERT INTO suppliers (name, viber_contact, notes) VALUES
('Antipolo Hardwood Supply', '09171234567', 'Main supplier for narra and mahogany lumber, Sumulong Hi-way'),
('Rizal Plywood and Foam Depot', '09182345678', 'Supplies plywood sheets and upholstery foam, Antipolo City'),
('Sierra Metalworks Trading', '09193456789', 'Supplies steel tubing, angle bars, and adhesives, Antipolo City');

-- Users
-- Password for admin@cornerblock.com is Admin1234
-- Password for staff@cornerblock.com is Staff1234
-- Hashes generated with PHP password_hash() using PASSWORD_BCRYPT
INSERT INTO users (name, role, email, password_hash, is_active) VALUES
('Cornerblock Admin', 'general_manager', 'admin@cornerblock.com', '$2y$10$XDR5QPNriKvhdLFxJQ5CS.KoNRy40fBMd1gJRlO.J2suRVhKXWTN2', 1),
('Cornerblock Staff', 'production_staff', 'staff@cornerblock.com', '$2y$10$vSnegq2BfKzJvgZRVUvopeQVZgUnlkGhdFAZQrxT59twZzQfz8Tse', 1);

-- Materials
-- Several rows are seeded below min_threshold so low-stock and stock-out
-- alerts can be tested right away
INSERT INTO materials (name, category, size, unit, stock_quantity, min_threshold, cost_per_unit, supplier_id, notes) VALUES
('Kiln-Dried Narra Lumber', 'wood', '2x6x8ft', 'pcs', 150, 50, 350.00, 1, 'Primary wood for cabinet frames'),
('Mahogany Plank', 'wood', '1x4x8ft', 'pcs', 18, 30, 220.00, 1, 'Below threshold, used for trim and detailing'),
('Marine Plywood 18mm', 'plywood', '4x8ft', 'sheet', 40, 20, 950.00, 2, 'Used for cabinet bodies'),
('Plywood 12mm', 'plywood', '4x8ft', 'sheet', 8, 15, 720.00, 2, 'Below threshold, used for drawer backs'),
('Mild Steel Square Tube', 'metal', '1x1in', 'pcs', 60, 25, 180.00, 3, 'Used for chair and table frames'),
('Steel Angle Bar', 'metal', '2x2in', 'pcs', 5, 20, 210.00, 3, 'Below threshold, used for structural bracing'),
('High-Density Foam', 'foam', '4in thick', 'sheet', 25, 10, 650.00, 2, 'Used for sofa and chair cushions'),
('Foam Padding Roll', 'foam', '2in thick', 'roll', 0, 5, 480.00, 2, 'Out of stock, used for armrest padding'),
('Leatherette Fabric', 'leatherette', '54in wide', 'yard', 35, 15, 150.00, 1, 'Upholstery covering material'),
('Contact Adhesive Gallon', 'adhesives', '1 gallon', 'can', 3, 8, 540.00, 3, 'Below threshold, used for laminate bonding');

-- Stock movements (sample history)
INSERT INTO stock_movements (material_id, type, quantity, movement_date, logged_by, notes) VALUES
(1, 'in', 200, '2026-06-01', 1, 'Initial delivery from Antipolo Hardwood Supply'),
(1, 'out', 50, '2026-06-10', 2, 'Used for cabinet order #101'),
(2, 'in', 50, '2026-06-01', 1, 'Initial delivery'),
(2, 'out', 32, '2026-06-15', 2, 'Used for trim work, order #102'),
(3, 'in', 60, '2026-06-02', 1, 'Initial delivery from Rizal Plywood and Foam Depot'),
(3, 'out', 20, '2026-06-12', 2, 'Used for cabinet bodies, order #101'),
(4, 'in', 25, '2026-06-02', 1, 'Initial delivery'),
(4, 'out', 17, '2026-06-18', 2, 'Used for drawer backs, order #103'),
(5, 'in', 80, '2026-06-03', 1, 'Initial delivery from Sierra Metalworks Trading'),
(5, 'out', 20, '2026-06-14', 2, 'Used for chair frames, order #104'),
(6, 'in', 25, '2026-06-03', 1, 'Initial delivery'),
(6, 'out', 20, '2026-06-20', 2, 'Used for structural bracing, order #104'),
(7, 'in', 30, '2026-06-04', 1, 'Initial delivery'),
(7, 'out', 5, '2026-06-16', 2, 'Used for sofa cushions, order #105'),
(8, 'in', 15, '2026-06-04', 1, 'Initial delivery'),
(8, 'out', 15, '2026-06-22', 2, 'Used for armrest padding, order #105'),
(9, 'in', 50, '2026-06-05', 1, 'Initial delivery from Antipolo Hardwood Supply'),
(9, 'out', 15, '2026-06-17', 2, 'Used for upholstery, order #103'),
(10, 'in', 10, '2026-06-05', 1, 'Initial delivery'),
(10, 'out', 7, '2026-06-21', 2, 'Used for laminate bonding, order #106');
