// The data migration, end to end
//
// Imports a synthetic LAN database into the emulator with the real import
// code, then reads it back through the app's own code, under the real
// firestore.rules, as a manager and as production staff. That last part is
// the real test: migrated data that the app cannot read properly, or that
// shows staff a cost, would be a failed migration however tidy it looked.
//
// The client's real database has a catalog but no stock movements yet, so
// the movement and receipt paths are exercised here with synthetic data.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { withRequirements } from './requirements.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

globalThis.__CORNERBLOCK_USE_EMULATORS__ = true;

const PROJECT_ID = 'cornerblock-inventory';

let adminDb;
let FieldValue;
let Timestamp;
let runImport;
let runVerify;
let compressReceiptFile;
let buildPlan;
let parseDump;

let auth;
let firebaseAuth;
let authLib;
let session;
let materialsLib;
let movementsLib;
let receiptsLib;
let trail;

let receiptsDir;

const DUMP = [
  'CREATE TABLE `suppliers` (\n  `supplier_id` int(11),\n  `name` varchar(100),\n  `viber_contact` varchar(20),\n  `notes` text\n) ENGINE=InnoDB;',
  "INSERT INTO `suppliers` (`supplier_id`, `name`, `viber_contact`, `notes`) VALUES (1,'Antipolo Hardwood Supply','09171234567','Narra and mahogany');",
  'CREATE TABLE `materials` (\n  `material_id` int(11),\n  `name` varchar(100),\n  `category` varchar(50),\n  `size` varchar(50),\n  `unit` varchar(20),\n  `stock_quantity` int(11),\n  `min_threshold` int(11),\n  `cost_per_unit` decimal(10,2),\n  `supplier_id` int(11),\n  `notes` text\n) ENGINE=InnoDB;',
  "INSERT INTO `materials` (`material_id`, `name`, `category`, `size`, `unit`, `stock_quantity`, `min_threshold`, `cost_per_unit`, `supplier_id`, `notes`) VALUES (1,'Kiln-Dried Narra Lumber','wood','2x6x8ft','pcs',150,50,350.00,1,'Primary wood'),(2,'Mahogany Plank','wood','1x4x8ft','pcs',18,30,220.00,1,NULL);",
  'CREATE TABLE `stock_movements` (\n  `movement_id` int(11),\n  `material_id` int(11),\n  `type` enum(\'in\',\'out\'),\n  `quantity` int(11),\n  `movement_date` date,\n  `logged_by` int(11),\n  `notes` text,\n  `receipt_file` varchar(255)\n) ENGINE=InnoDB;',
  "INSERT INTO `stock_movements` (`movement_id`, `material_id`, `type`, `quantity`, `movement_date`, `logged_by`, `notes`, `receipt_file`) VALUES (1,1,'in',200,'2026-06-01',1,'Purchase | Ref: PO-1042 | delivered late','receipt_photo.png'),(2,1,'out',50,'2026-06-10',2,'Project Usage | Project: Sofa set',NULL),(3,2,'in',50,'2026-06-01',1,'Initial delivery',NULL),(4,2,'out',32,'2026-06-15',2,'Damaged',NULL);",
].join('\n');

const USER_NAMES = new Map([[1, 'Cornerblock Admin'], [2, 'Juan Dela Cruz']]);

beforeAll(async () => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

  // ---- The import side: the Admin SDK ----
  const adminApp = await import('firebase-admin/app');
  const adminFirestore = await import('firebase-admin/firestore');
  const app = adminApp.getApps().find((a) => a.name === 'migration-test') ||
    adminApp.initializeApp({ projectId: PROJECT_ID }, 'migration-test');
  adminDb = adminFirestore.getFirestore(app);
  FieldValue = adminFirestore.FieldValue;
  Timestamp = adminFirestore.Timestamp;

  ({ runImport, compressReceiptFile } = await import('../../tools/migrate/import.mjs'));
  ({ runVerify } = await import('../../tools/migrate/verify.mjs'));
  ({ buildPlan } = await import('../../tools/migrate/convert.mjs'));
  ({ parseDump } = await import('../../tools/migrate/sql-dump.mjs'));

  // ---- The reading side: the app's own client code ----
  const firebaseModule = await import('../../app-firebase/src/lib/firebase.js');
  auth = firebaseModule.auth;
  firebaseAuth = await import('firebase/auth');
  authLib = await import('../../app-firebase/src/lib/auth.js');
  session = await import('../../app-firebase/src/lib/session.js');
  materialsLib = await import('../../app-firebase/src/lib/materials.js');
  // logMovement() fills in the receipt and project every new movement
  // needs, unless the test gives its own (see requirements.js)
  const movementsModule = await import('../../app-firebase/src/lib/movements.js');
  movementsLib = {
    ...movementsModule,
    logMovement: (args) => movementsModule.logMovement(withRequirements(args)),
  };
  receiptsLib = await import('../../app-firebase/src/lib/receipts.js');
  trail = await import('../../app-firebase/src/lib/auditTrail.js');

  // ---- A receipt as a phone would take it: large and mostly plain ----
  receiptsDir = mkdtempSync(join(tmpdir(), 'cornerblock-receipts-'));
  const width = 2400;
  const height = 3200;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const line = y % 100 < 3 ? 150 : 0;
      const v = 235 - line;
      pixels[i] = v;
      pixels[i + 1] = v;
      pixels[i + 2] = v - 6;
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(join(receiptsDir, 'receipt_photo.png'));
}, 60000);

afterAll(async () => {
  await auth.signOut().catch(() => {});
  if (receiptsDir) rmSync(receiptsDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  await auth.signOut().catch(() => {});
  session.clearCurrentUser();
});

// ============================================================
// HELPERS
// ============================================================

function freshPlan() {
  return buildPlan({
    tables: parseDump(DUMP),
    userNames: USER_NAMES,
    receiptFiles: ['receipt_photo.png'],
  });
}

async function importPlan(plan = freshPlan(), options = {}) {
  return runImport({
    db: adminDb,
    FieldValue,
    Timestamp,
    plan,
    receiptsDir,
    commit: true,
    force: false,
    ...options,
  });
}

async function signInAs(email, role) {
  const credential = await firebaseAuth.createUserWithEmailAndPassword(auth, email, 'Password2026');
  await adminDb.collection('users').doc(credential.user.uid).set({
    name: role === 'general_manager' ? 'Shop Manager' : 'Juan Dela Cruz',
    email,
    role,
    status: 'active',
    provider: 'password',
    emailVerified: true,
    lastAuditId: 'seed',
  });
  await authLib.bootstrapUser(credential.user, 'password');
}

// ============================================================
// THE IMPORT ITSELF
// ============================================================

describe('importing', () => {
  it('writes what the plan says and nothing else', async () => {
    const plan = freshPlan();
    const report = await importPlan(plan);

    expect(report).toMatchObject({
      committed: true,
      suppliers: 1,
      materials: 2,
      materialCosts: 2,
      movements: 4,
      receipts: 1,
    });

    // One entry per supplier, per material, per movement, and the run
    expect(report.auditEntries).toBe(1 + 2 + 4 + 1);

    const verify = await runVerify({ db: adminDb, plan });
    expect(verify.failures).toEqual([]);
  });

  it('writes nothing at all on a dry run', async () => {
    const report = await importPlan(freshPlan(), { commit: false });

    expect(report.committed).toBe(false);
    expect(report.materials).toBe(2);

    for (const name of ['suppliers', 'materials', 'material_costs', 'stock_movements', 'receipts', 'audit_logs']) {
      expect((await adminDb.collection(name).get()).size).toBe(0);
    }
  });

  it('refuses to import over data that is already there', async () => {
    await importPlan();

    await expect(importPlan()).rejects.toThrow(/already has documents in materials/);
  });

  it('points every document at an existing data.migrate entry', async () => {
    await importPlan();

    for (const name of ['suppliers', 'materials', 'material_costs', 'stock_movements', 'receipts']) {
      const docs = (await adminDb.collection(name).get()).docs;
      expect(docs.length).toBeGreaterThan(0);

      for (const doc of docs) {
        const entry = await adminDb.collection('audit_logs').doc(doc.get('lastAuditId')).get();
        expect(entry.exists).toBe(true);
        expect(entry.get('action')).toBe('data.migrate');
      }
    }
  });

  it('records the run as a whole in one summary entry', async () => {
    await importPlan();

    const summary = (await adminDb.collection('audit_logs').where('entity', '==', 'migration').get()).docs;

    expect(summary).toHaveLength(1);
    expect(summary[0].get('after')).toMatchObject({ suppliers: 1, materials: 2, movements: 4, receipts: 1 });
    expect(summary[0].get('actorName')).toBe('Data migration from the LAN version');
  });
});

// ============================================================
// 19. RECEIPTS GO THROUGH THE SAME COMPRESSION AS AN UPLOAD
// ============================================================

describe('receipts', () => {
  it('19. compresses an old receipt to the same limits a new upload has', async () => {
    const compressed = await compressReceiptFile(join(receiptsDir, 'receipt_photo.png'));

    expect(compressed.mimeType).toBe('image/jpeg');
    expect(compressed.sizeBytes).toBeLessThanOrEqual(300000);
    expect(Math.max(compressed.width, compressed.height)).toBeLessThanOrEqual(1280);
    // The aspect ratio survives the resize
    expect(compressed.width / compressed.height).toBeCloseTo(2400 / 3200, 2);
    expect(compressed.originalBytes).toBeGreaterThan(compressed.sizeBytes);
  });

  it('19. refuses an image that will not fit, rather than storing it', async () => {
    // The real limit is practically unreachable, so a tiny one is used to
    // reach the refusal
    expect(await compressReceiptFile(join(receiptsDir, 'receipt_photo.png'), { maxBytes: 100 })).toBeNull();
  });

  it('imports a movement whose receipt is missing, without the receipt', async () => {
    const plan = freshPlan();
    plan.movements.find((m) => m.legacyId === 1).receiptFile = 'not-there.jpg';

    const report = await importPlan(plan);

    expect(report.receipts).toBe(0);
    expect(report.movements).toBe(4);
    expect(report.receiptsSkipped[0]).toContain('not-there.jpg');
  });
});

// ============================================================
// THE APP READING THE MIGRATED DATA, UNDER THE REAL RULES
// ============================================================

describe('the app reads the migrated data', () => {
  it('gives a manager the catalog with costs and suppliers joined', async () => {
    await importPlan();
    await signInAs('gm@example.com', 'general_manager');

    const catalog = await materialsLib.loadCatalog();
    const narra = catalog.materials.find((m) => m.name === 'Kiln-Dried Narra Lumber');

    expect(narra.stockQuantity).toBe(150);
    expect(narra.costPerUnit).toBe(350);
    expect(narra.supplierName).toBe('Antipolo Hardwood Supply');
    expect(catalog.suppliers.map((s) => s.name)).toEqual(['Antipolo Hardwood Supply']);
  });

  it('6. gives staff the migrated catalog with no cost or supplier', async () => {
    await importPlan();
    await signInAs('staff@example.com', 'production_staff');

    const catalog = await materialsLib.loadCatalog();
    const narra = catalog.materials.find((m) => m.name === 'Kiln-Dried Narra Lumber');

    expect(narra.stockQuantity).toBe(150);
    expect(narra.costPerUnit).toBeNull();
    expect(narra.supplierName).toBeNull();
  });

  it('shows the migrated history in the right order, with the old notes split', async () => {
    await importPlan();
    await signInAs('staff@example.com', 'production_staff');

    const { movements } = await movementsLib.loadMovements({});

    // Newest first, as the history page lists them
    expect(movements.map((m) => m.legacyId)).toEqual([4, 2, 3, 1]);

    const delivery = movements.find((m) => m.legacyId === 1);
    expect(delivery.reason).toBe('Purchase');
    expect(delivery.reference).toBe('PO-1042');
    expect(delivery.notes).toBe('delivered late');
    expect(delivery.loggedByName).toBe('Cornerblock Admin');
    expect(delivery.source).toBe('lan-migration');
    expect([delivery.beforeQty, delivery.afterQty]).toEqual([0, 200]);
  });

  it('opens a migrated receipt through the app', async () => {
    await importPlan();
    await signInAs('staff@example.com', 'production_staff');

    const { movements } = await movementsLib.loadMovements({});
    const delivery = movements.find((m) => m.legacyId === 1);

    const receipt = await receiptsLib.loadReceipt(delivery.receiptId);

    expect(receipt.mimeType).toBe('image/jpeg');
    expect(receipt.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(receipt.legacyFile).toBe('receipt_photo.png');
  });

  it('lets a material carry on from its migrated figure', async () => {
    // The first stock-out after the move must start from the imported
    // quantity and be accepted by the rules
    await importPlan();
    await signInAs('staff@example.com', 'production_staff');

    const plank = (await materialsLib.loadCatalog()).materials.find((m) => m.name === 'Mahogany Plank');
    const { afterQty } = await movementsLib.logMovement({
      type: 'out',
      material: plank,
      quantity: '8',
      reason: 'Project Usage',
    });

    expect(afterQty).toBe(10);
    expect((await adminDb.collection('materials').doc(plank.id).get()).get('stockQuantity')).toBe(10);
  });

  it('lets a manager edit a migrated material', async () => {
    await importPlan();
    await signInAs('gm@example.com', 'general_manager');

    const existing = (await materialsLib.loadCatalog()).materials.find((m) => m.name === 'Mahogany Plank');
    await materialsLib.updateMaterial(existing.id, existing, {
      name: 'Mahogany Plank',
      category: 'wood',
      size: '1x4x8ft',
      unit: 'pcs',
      minThreshold: '25',
      costPerUnit: '230',
      supplierId: existing.supplierId,
      supplierName: existing.supplierName,
      notes: '',
    });

    expect((await adminDb.collection('materials').doc(existing.id).get()).get('minThreshold')).toBe(25);
    expect((await adminDb.collection('material_costs').doc(existing.id).get()).get('costPerUnit')).toBe(230);
  });

  it('finds a migrated material’s history in the audit trail by material', async () => {
    await importPlan();
    await signInAs('gm@example.com', 'general_manager');

    const { entries } = await trail.loadAuditPage({ materialId: 'legacy-material-1' });

    // The material itself and its two movements
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.action === 'data.migrate')).toBe(true);
  });
});
