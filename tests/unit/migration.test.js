// The data migration: reading the dump and building the plan
//
// The real LAN database holds a catalog but no stock movements yet, so the
// parts of the migration that handle movements and receipts would otherwise
// go untested until the day the client's history is moved. These tests give
// them synthetic data shaped exactly like a mysqldump.

import { describe, it, expect } from 'vitest';

import { parseDump, parseUserNames } from '../../tools/migrate/sql-dump.mjs';
import {
  buildPlan,
  splitLegacyNotes,
  reconstructQuantities,
  materialDocId,
  supplierDocId,
  movementDocId,
} from '../../tools/migrate/convert.mjs';

// A dump in the shape mysqldump writes with --complete-insert: one CREATE
// TABLE and one multi-row INSERT per table
const DUMP = String.raw`
/*!40101 SET NAMES utf8mb4 */;
DROP TABLE IF EXISTS \`suppliers\`;
CREATE TABLE \`suppliers\` (
  \`supplier_id\` int(11) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(100) NOT NULL,
  \`viber_contact\` varchar(20) DEFAULT NULL,
  \`notes\` text DEFAULT NULL,
  PRIMARY KEY (\`supplier_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
LOCK TABLES \`suppliers\` WRITE;
INSERT INTO \`suppliers\` (\`supplier_id\`, \`name\`, \`viber_contact\`, \`notes\`) VALUES (1,'Antipolo Hardwood Supply','09171234567','Narra, mahogany; Sumulong Hi-way'),(2,'O\'Brien\'s Foam (Rizal)',NULL,'Line one\nline two, with a comma');
UNLOCK TABLES;

CREATE TABLE \`materials\` (
  \`material_id\` int(11) NOT NULL AUTO_INCREMENT,
  \`name\` varchar(100) NOT NULL,
  \`category\` varchar(50) NOT NULL,
  \`size\` varchar(50) DEFAULT NULL,
  \`unit\` varchar(20) NOT NULL,
  \`stock_quantity\` int(11) NOT NULL DEFAULT 0,
  \`min_threshold\` int(11) NOT NULL DEFAULT 0,
  \`cost_per_unit\` decimal(10,2) DEFAULT NULL,
  \`supplier_id\` int(11) DEFAULT NULL,
  \`notes\` text DEFAULT NULL,
  PRIMARY KEY (\`material_id\`),
  CONSTRAINT \`fk_materials_supplier\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`suppliers\` (\`supplier_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO \`materials\` (\`material_id\`, \`name\`, \`category\`, \`size\`, \`unit\`, \`stock_quantity\`, \`min_threshold\`, \`cost_per_unit\`, \`supplier_id\`, \`notes\`) VALUES (1,'Kiln-Dried Narra Lumber','wood','2x6x8ft','pcs',150,50,350.00,1,'Primary wood'),(2,'Mahogany Plank','wood','1x4x8ft','pcs',18,30,220.50,1,NULL),(3,'Back\\slash Test','misc',NULL,'pcs',5,0,NULL,NULL,'Path C:\\shop\\stock'),(4,'Foam Padding Roll','foam','2in','roll',0,5,480.00,2,'');

CREATE TABLE \`stock_movements\` (
  \`movement_id\` int(11) NOT NULL AUTO_INCREMENT,
  \`material_id\` int(11) NOT NULL,
  \`type\` enum('in','out') NOT NULL,
  \`quantity\` int(11) NOT NULL,
  \`movement_date\` date NOT NULL,
  \`logged_by\` int(11) NOT NULL,
  \`notes\` text DEFAULT NULL,
  \`receipt_file\` varchar(255) DEFAULT NULL,
  PRIMARY KEY (\`movement_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO \`stock_movements\` (\`movement_id\`, \`material_id\`, \`type\`, \`quantity\`, \`movement_date\`, \`logged_by\`, \`notes\`, \`receipt_file\`) VALUES (1,1,'in',200,'2026-06-01',1,'Purchase | Ref: PO-1042 | delivered late','receipt_a.jpg'),(2,1,'out',50,'2026-06-10',2,'Project Usage | Project: Sofa set (Reyes) | rush',NULL),(3,2,'in',50,'2026-06-01',1,'Initial delivery',NULL),(4,2,'out',32,'2026-06-15',2,'Damaged',NULL),(5,1,'out',0,'2026-06-10',2,NULL,NULL);
`.replace(/\\`/g, '`');

// ============================================================
// READING THE DUMP
// ============================================================

describe('parseDump', () => {
  const tables = parseDump(DUMP);

  it('reads every row of every table', () => {
    expect(tables.suppliers.rows).toHaveLength(2);
    expect(tables.materials.rows).toHaveLength(4);
    expect(tables.stock_movements.rows).toHaveLength(5);
  });

  it('reads columns in the order the table defines them', () => {
    expect(tables.materials.columns).toEqual([
      'material_id', 'name', 'category', 'size', 'unit', 'stock_quantity',
      'min_threshold', 'cost_per_unit', 'supplier_id', 'notes',
    ]);
  });

  it('reads NULL as null and numbers as numbers', () => {
    const plank = tables.materials.rows[1];

    expect(plank.notes).toBeNull();
    expect(plank.stock_quantity).toBe(18);
    expect(plank.cost_per_unit).toBe(220.5);
  });

  it('copes with escaped quotes, commas and brackets inside a value', () => {
    // A regular expression splitting on commas or brackets would break here
    expect(tables.suppliers.rows[1].name).toBe("O'Brien's Foam (Rizal)");
    expect(tables.suppliers.rows[0].notes).toBe('Narra, mahogany; Sumulong Hi-way');
  });

  it('undoes MySQL escapes for line breaks and backslashes', () => {
    expect(tables.suppliers.rows[1].notes).toBe('Line one\nline two, with a comma');
    expect(tables.materials.rows[2].name).toBe('Back\\slash Test');
    expect(tables.materials.rows[2].notes).toBe('Path C:\\shop\\stock');
  });

  it('keeps a date as the text MySQL wrote', () => {
    expect(tables.stock_movements.rows[0].movement_date).toBe('2026-06-01');
  });

  it('reads an INSERT that has no column list, using CREATE TABLE', () => {
    const sql = [
      'CREATE TABLE `t` (\n  `a` int NOT NULL,\n  `b` varchar(5)\n) ENGINE=InnoDB;',
      "INSERT INTO `t` VALUES (1,'x'),(2,NULL);",
    ].join('\n');

    expect(parseDump(sql).t.rows).toEqual([{ a: 1, b: 'x' }, { a: 2, b: null }]);
  });

  it('accepts a doubled quote, the other way MySQL escapes one', () => {
    const sql = "CREATE TABLE `t` (\n  `a` text\n) X;\nINSERT INTO `t` (`a`) VALUES ('It''s');";

    expect(parseDump(sql).t.rows[0].a).toBe("It's");
  });

  it('refuses a row with the wrong number of values', () => {
    const sql = "INSERT INTO `t` (`a`, `b`) VALUES (1);";

    expect(() => parseDump(sql)).toThrow(/1 values but the table has 2 columns/);
  });

  it('refuses an unterminated string rather than reading past it', () => {
    expect(() => parseDump("INSERT INTO `t` (`a`) VALUES ('oops);")).toThrow(/never closed/);
  });
});

describe('parseUserNames', () => {
  it('reads the id and name, and undoes the escapes mysql --batch adds', () => {
    const names = parseUserNames('1\tCornerblock Admin\n2\tJuan Dela Cruz\n3\tName\\twith tab\n');

    expect(names.get(1)).toBe('Cornerblock Admin');
    expect(names.get(2)).toBe('Juan Dela Cruz');
    expect(names.get(3)).toBe('Name\twith tab');
  });

  it('copes with Windows line endings and a blank last line', () => {
    expect(parseUserNames('1\tA\r\n2\tB\r\n\r\n').size).toBe(2);
  });
});

// ============================================================
// SPLITTING THE OLD NOTES COLUMN
// ============================================================

describe('splitLegacyNotes', () => {
  it('takes a stock-in note apart into reason, reference and notes', () => {
    expect(splitLegacyNotes('in', 'Purchase | Ref: PO-1042 | delivered late')).toEqual({
      reason: 'Purchase',
      reference: 'PO-1042',
      notes: 'delivered late',
    });
  });

  it('uses Project: as the reference for a stock-out, as the old form did', () => {
    expect(splitLegacyNotes('out', 'Project Usage | Project: Sofa set | rush')).toEqual({
      reason: 'Project Usage',
      reference: 'Sofa set',
      notes: 'rush',
    });
  });

  it('treats any part as optional, as buildNotes() did', () => {
    expect(splitLegacyNotes('out', 'Damaged')).toEqual({ reason: 'Damaged', reference: '', notes: '' });
    expect(splitLegacyNotes('in', 'Ref: DR-7')).toEqual({ reason: '', reference: 'DR-7', notes: '' });
    expect(splitLegacyNotes('in', 'just a note')).toEqual({ reason: '', reference: '', notes: 'just a note' });
  });

  it('only accepts a reason the old form could have sent for that type', () => {
    // "Purchase" is a stock-in reason, so on a stock-out it is just text
    expect(splitLegacyNotes('out', 'Purchase | something')).toEqual({
      reason: '',
      reference: '',
      notes: 'Purchase | something',
    });
  });

  it('never loses text, even a note that itself contained the separator', () => {
    const result = splitLegacyNotes('in', 'Restock | first | second | third');

    expect(result.reason).toBe('Restock');
    expect(result.notes).toBe('first | second | third');
  });

  it('handles empty and missing notes', () => {
    const empty = { reason: '', reference: '', notes: '' };
    expect(splitLegacyNotes('in', '')).toEqual(empty);
    expect(splitLegacyNotes('in', null)).toEqual(empty);
  });

  it('does not mistake a stock-out reference prefix on a stock-in', () => {
    expect(splitLegacyNotes('in', 'Purchase | Project: x').reference).toBe('');
  });
});

// ============================================================
// RECONSTRUCTING BEFORE AND AFTER
// ============================================================

describe('reconstructQuantities', () => {
  it('works backwards from the current stock', () => {
    // In 200, out 50: now 150
    const { results, openingStock, problems } = reconstructQuantities(
      [{ type: 'in', quantity: 200 }, { type: 'out', quantity: 50 }],
      150
    );

    expect(results).toEqual([
      { beforeQty: 0, afterQty: 200 },
      { beforeQty: 200, afterQty: 150 },
    ]);
    expect(openingStock).toBe(0);
    expect(problems).toEqual([]);
  });

  it('recovers an opening stock that was typed in rather than moved', () => {
    // The material was added with 30 already on the shelf, then one
    // delivery of 10 arrived: now 40. Going forwards would need the 30,
    // which was never a movement. Going backwards finds it.
    const { results, openingStock } = reconstructQuantities([{ type: 'in', quantity: 10 }], 40);

    expect(openingStock).toBe(30);
    expect(results[0]).toEqual({ beforeQty: 30, afterQty: 40 });
  });

  it('reports records that do not add up', () => {
    // 100 came in and nothing went out, yet only 10 are on the shelf. No
    // opening stock can explain that: working back gives -90.
    const { problems, openingStock } = reconstructQuantities([{ type: 'in', quantity: 100 }], 10);

    expect(openingStock).toBe(-90);
    expect(problems).toHaveLength(1);
  });
});

// ============================================================
// THE PLAN
// ============================================================

describe('buildPlan', () => {
  const tables = parseDump(DUMP);
  const userNames = new Map([[1, 'Cornerblock Admin'], [2, 'Juan Dela Cruz']]);
  const plan = buildPlan({ tables, userNames, receiptFiles: ['receipt_a.jpg', 'orphan.png'] });

  it('gives each document an id built from its old one', () => {
    expect(plan.suppliers.map((s) => s.id)).toEqual([supplierDocId(1), supplierDocId(2)]);
    expect(plan.materials[0].id).toBe('legacy-material-1');
    expect(plan.movements.map((m) => m.id)).toContain(movementDocId(1));
  });

  it('keeps the old id on every document', () => {
    expect(plan.materials.map((m) => m.legacyId)).toEqual([1, 2, 3, 4]);
  });

  it('splits cost and supplier into a record of their own', () => {
    const plank = plan.materials.find((m) => m.legacyId === 2);

    // Not on the material, which staff can read
    expect(plank.data).not.toHaveProperty('costPerUnit');
    expect(plank.data).not.toHaveProperty('supplierId');

    expect(plank.cost).toEqual({
      costPerUnit: 220.5,
      supplierId: supplierDocId(1),
      supplierName: 'Antipolo Hardwood Supply',
    });
  });

  it('writes no cost record for a material that had neither cost nor supplier', () => {
    expect(plan.materials.find((m) => m.legacyId === 3).cost).toBeNull();
  });

  it('turns empty optional fields into empty text', () => {
    const odd = plan.materials.find((m) => m.legacyId === 3);

    expect(odd.data.size).toBe('');
    expect(plan.materials.find((m) => m.legacyId === 2).data.notes).toBe('');
  });

  it('imports every material as not archived', () => {
    expect(plan.materials.every((m) => m.data.isArchived === false)).toBe(true);
  });

  it('keeps the stock figures exactly as they are', () => {
    // The movements are history. The current figure already includes them,
    // so they must not be applied a second time.
    expect(plan.materials.map((m) => m.data.stockQuantity)).toEqual([150, 18, 5, 0]);
  });

  it('fills in who logged each movement by name, without migrating the account', () => {
    const movement = plan.movements.find((m) => m.legacyId === 2);

    expect(movement.data.loggedByName).toBe('Juan Dela Cruz');
    expect(movement.data.loggedBy).toBeNull();
    expect(movement.data.legacyLoggedById).toBe(2);
  });

  it('splits the old notes on each movement', () => {
    const movement = plan.movements.find((m) => m.legacyId === 1);

    expect(movement.data.reason).toBe('Purchase');
    expect(movement.data.reference).toBe('PO-1042');
    expect(movement.data.notes).toBe('delivered late');
  });

  it('reconstructs before and after on each movement', () => {
    const narra = plan.movements.filter((m) => m.materialLegacyId === 1);

    // In 200, out 50, out 0 on the same day as the out 50: ends at 150
    expect(narra.map((m) => [m.data.beforeQty, m.data.afterQty])).toEqual([
      [0, 200],
      [200, 150],
      [150, 150],
    ]);
  });

  it('marks movements as reconstructed, for the history page', () => {
    expect(plan.movements.every((m) => m.data.source === 'lan-migration')).toBe(true);
  });

  it('keeps same-day movements in the order they were entered, across materials', () => {
    // Movements 1 and 3 are both on 2026-06-01, on different materials.
    // Movement 1 was entered first and must come first.
    const first = plan.movements.find((m) => m.legacyId === 1).data.createdAt;
    const third = plan.movements.find((m) => m.legacyId === 3).data.createdAt;

    expect(first < third).toBe(true);
  });

  it('places movements on their date in Philippine time', () => {
    const movement = plan.movements.find((m) => m.legacyId === 1);

    expect(movement.data.movementDate).toBe('2026-06-01');
    // 08:00 at +08:00 is midnight UTC
    expect(movement.data.createdAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('attaches a receipt that exists, and lists one nothing refers to', () => {
    expect(plan.movements.find((m) => m.legacyId === 1).receiptFile).toBe('receipt_a.jpg');
    expect(plan.orphanReceipts).toEqual(['orphan.png']);
    expect(plan.summary.receipts).toBe(1);
  });

  it('warns about a receipt the movement names but the folder lacks', () => {
    const missing = buildPlan({ tables, userNames, receiptFiles: [] });

    expect(missing.movements.find((m) => m.legacyId === 1).receiptFile).toBeNull();
    expect(missing.warnings.some((w) => w.includes('receipt_a.jpg'))).toBe(true);
  });

  it('warns rather than inventing names when none were exported', () => {
    const anonymous = buildPlan({ tables, receiptFiles: ['receipt_a.jpg'] });

    expect(anonymous.movements[0].data.loggedByName).toMatch(/^LAN user #\d$/);
    expect(anonymous.warnings.some((w) => w.includes('No user names were supplied'))).toBe(true);
  });

  it('warns about a material whose records do not add up', () => {
    const broken = parseDump(DUMP);
    // Mahogany's records say 50 came in and 32 went out, which should leave
    // at least 18. If the stored figure is 0, something changed it outside
    // the movements: walking back gives an impossible opening stock of -18.
    broken.materials.rows[1].stock_quantity = 0;

    const result = buildPlan({ tables: broken, userNames, receiptFiles: ['receipt_a.jpg'] });

    expect(result.warnings.some((w) => w.includes('do not add up'))).toBe(true);
  });

  it('leaves out a movement whose material is missing, with a warning', () => {
    const orphaned = parseDump(DUMP);
    orphaned.stock_movements.rows.push({
      movement_id: 99, material_id: 999, type: 'in', quantity: 1,
      movement_date: '2026-06-02', logged_by: 1, notes: null, receipt_file: null,
    });

    const result = buildPlan({ tables: orphaned, userNames, receiptFiles: ['receipt_a.jpg'] });

    expect(result.movements.find((m) => m.legacyId === 99)).toBeUndefined();
    expect(result.warnings.some((w) => w.includes('Movement 99'))).toBe(true);
  });

  it('carries no email address or password, since the users table is never read', () => {
    const text = JSON.stringify(plan);

    expect(text).not.toMatch(/\$2y\$/);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });

  it('counts what it will write', () => {
    expect(plan.summary).toEqual({
      suppliers: 2,
      materials: 4,
      materialCosts: 3,
      movements: 5,
      receipts: 1,
      orphanReceipts: 1,
      warnings: 0,
    });
  });
});
