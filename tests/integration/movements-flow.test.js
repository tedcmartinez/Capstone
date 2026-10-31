// Stock movements, end to end
//
// The point of these is the arithmetic and the audit trail: that a movement
// writes the quantity it claims, that the material's running total follows,
// that both land together or not at all, and that the server refuses a
// withdrawal larger than the stock on hand even if the browser is talked
// into asking for one.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

globalThis.__CORNERBLOCK_USE_EMULATORS__ = true;

const PROJECT_ID = 'cornerblock-inventory';
const OWNER = { Authorization: 'Bearer owner' };

let auth;
let authLib;
let session;
let materialsLib;
let movementsLib;
let firebaseAuth;

beforeAll(async () => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

  const firebaseModule = await import('../../app-firebase/src/lib/firebase.js');
  auth = firebaseModule.auth;

  firebaseAuth = await import('firebase/auth');
  authLib = await import('../../app-firebase/src/lib/auth.js');
  session = await import('../../app-firebase/src/lib/session.js');
  materialsLib = await import('../../app-firebase/src/lib/materials.js');
  movementsLib = await import('../../app-firebase/src/lib/movements.js');
});

afterAll(async () => {
  await auth.signOut().catch(() => {});
});

beforeEach(async () => {
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  });
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  await auth.signOut().catch(() => {});
  session.clearCurrentUser();

  await seedMaterial('m1', { name: 'Mahogany Plank', stock: 18, threshold: 30, unit: 'pcs' });
});

// ============================================================
// HELPERS
// ============================================================

async function seed(path, fields) {
  const [collectionName, id] = path.split('/');
  await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}?documentId=${id}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...OWNER },
      body: JSON.stringify({ fields }),
    }
  );
}

function seedMaterial(id, { name, stock, threshold, unit }) {
  return seed(`materials/${id}`, {
    name: { stringValue: name },
    category: { stringValue: 'wood' },
    unit: { stringValue: unit },
    size: { stringValue: '' },
    stockQuantity: { integerValue: String(stock) },
    minThreshold: { integerValue: String(threshold) },
    notes: { stringValue: '' },
    isArchived: { booleanValue: false },
    lastAuditId: { stringValue: 'seed' },
  });
}

async function fetchDoc(path) {
  const response = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
    { headers: OWNER }
  );
  if (!response.ok) return null;
  return (await response.json()).fields || null;
}

async function listCollection(name) {
  const response = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/${name}`,
    { headers: OWNER }
  );
  if (!response.ok) return [];
  return (await response.json()).documents || [];
}

// Writes resolve against the cache first, so the server copy is polled
async function waitFor(check, { attempts = 40, interval = 50 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return null;
}

const waitForDoc = (path) => waitFor(() => fetchDoc(path));

async function waitForAudit(action) {
  return waitFor(async () => {
    const docs = await listCollection('audit_logs');
    const found = docs.find((d) => d.fields?.action?.stringValue === action);
    return found || null;
  });
}

async function signInAs(email, role) {
  const credential = await firebaseAuth.createUserWithEmailAndPassword(auth, email, 'Password2026');

  await seed(`users/${credential.user.uid}`, {
    name: { stringValue: role === 'general_manager' ? 'Shop Manager' : 'Juan Dela Cruz' },
    email: { stringValue: email },
    role: { stringValue: role },
    status: { stringValue: 'active' },
    provider: { stringValue: 'password' },
    emailVerified: { booleanValue: true },
    lastAuditId: { stringValue: 'seed' },
  });

  await authLib.bootstrapUser(credential.user, 'password');
  return credential.user.uid;
}

function number(field) {
  if (!field) return null;
  return Number(field.integerValue ?? field.doubleValue);
}

// ============================================================
// LOGGING A MOVEMENT
// ============================================================

describe('logging a stock-in', () => {
  it('writes the movement and raises the material total together', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    const { movementId } = await movementsLib.logMovement({
      type: 'in',
      material,
      quantity: '50',
      reason: 'Purchase',
      reference: 'PO-1042',
      notes: 'Delivered in the afternoon',
    });

    const movement = await waitForDoc(`stock_movements/${movementId}`);
    expect(movement.type.stringValue).toBe('in');
    expect(number(movement.quantity)).toBe(50);
    expect(number(movement.beforeQty)).toBe(18);
    expect(number(movement.afterQty)).toBe(68);
    expect(movement.loggedBy.stringValue).toBe(uid);
    expect(movement.loggedByName.stringValue).toBe('Juan Dela Cruz');

    // The running total on the material follows in the same batch
    const updated = await waitFor(async () => {
      const fields = await fetchDoc('materials/m1');
      return number(fields.stockQuantity) === 68 ? fields : null;
    });
    expect(number(updated.stockQuantity)).toBe(68);
  });

  it('keeps reason, reference and notes as three separate fields', async () => {
    // The LAN version joined these into one notes column with pipes, which
    // made them unreadable as data. They are split out now.
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    const { movementId } = await movementsLib.logMovement({
      type: 'in',
      material,
      quantity: '10',
      reason: 'Purchase',
      reference: 'PO-1042',
      notes: 'Delivered late',
    });

    const movement = await waitForDoc(`stock_movements/${movementId}`);
    expect(movement.reason.stringValue).toBe('Purchase');
    expect(movement.reference.stringValue).toBe('PO-1042');
    expect(movement.notes.stringValue).toBe('Delivered late');
  });

  it('stamps today as the date rather than taking one from the form', async () => {
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    const { movementId } = await movementsLib.logMovement({
      type: 'in',
      material,
      quantity: '1',
      reason: 'Purchase',
    });

    const movement = await waitForDoc(`stock_movements/${movementId}`);
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    expect(movement.movementDate.stringValue).toBe(expected);
  });

  it('records a readable summary in the audit trail', async () => {
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    await movementsLib.logMovement({
      type: 'out',
      material,
      quantity: '5',
      reason: 'Project Usage',
      reference: 'order #102',
    });

    const entry = await waitForAudit('stock.out');
    expect(entry).not.toBeNull();
    expect(entry.fields.summary.stringValue).toBe(
      'Stock out 5 pcs, Mahogany Plank (Project Usage: order #102)'
    );
    expect(number(entry.fields.before.mapValue.fields.stockQuantity)).toBe(18);
    expect(number(entry.fields.after.mapValue.fields.stockQuantity)).toBe(13);
  });
});

// ============================================================
// 12. STOCK CANNOT GO BELOW ZERO
// ============================================================

describe('12. withdrawing more than is on hand', () => {
  it('is refused before anything is written', async () => {
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    await expect(
      movementsLib.logMovement({ type: 'out', material, quantity: '25', reason: 'Damaged' })
    ).rejects.toThrow(/Cannot remove more than the 18 pcs/);

    // Nothing was recorded and the total is untouched
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(await listCollection('stock_movements')).toEqual([]);
    expect(number((await fetchDoc('materials/m1')).stockQuantity)).toBe(18);
  });

  it('is refused by the server too, not only by the browser check', async () => {
    // This goes around logMovement() and writes the batch by hand with a
    // negative afterQty, which is what a tampered browser would do. The
    // rules are what stop it, so this is the check that actually matters.
    const uid = await signInAs('staff@example.com', 'production_staff');

    const { doc, writeBatch, serverTimestamp, collection } = await import('firebase/firestore');
    const { db } = await import('../../app-firebase/src/lib/firebase.js');

    const auditId = doc(collection(db, 'audit_logs')).id;
    const movementId = doc(collection(db, 'stock_movements')).id;
    const batch = writeBatch(db);

    batch.set(doc(db, 'stock_movements', movementId), {
      materialId: 'm1',
      materialName: 'Mahogany Plank',
      type: 'out',
      quantity: 25,
      beforeQty: 18,
      afterQty: -7,
      movementDate: '2026-10-31',
      reason: 'Damaged',
      reference: '',
      notes: '',
      receiptId: null,
      loggedBy: uid,
      loggedByName: 'Juan Dela Cruz',
      createdAt: serverTimestamp(),
      lastAuditId: auditId,
    });
    batch.update(doc(db, 'materials', 'm1'), {
      stockQuantity: -7,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      lastAuditId: auditId,
    });
    batch.set(doc(db, 'audit_logs', auditId), {
      action: 'stock.out',
      entity: 'stock_movements',
      entityId: movementId,
      actorUid: uid,
      actorEmail: 'staff@example.com',
      actorName: 'Juan Dela Cruz',
      actorRole: 'production_staff',
      summary: 'Tampered withdrawal',
      timestamp: serverTimestamp(),
      appVersion: '2.0.0',
    });

    let rejected = false;
    try {
      await batch.commit();
    } catch (error) {
      rejected = true;
      expect(String(error)).toMatch(/permission|insufficient/i);
    }

    await new Promise((resolve) => setTimeout(resolve, 800));

    // Whether the refusal arrived as an exception or as a rollback, the
    // outcome must be the same: nothing written, total unchanged.
    expect(await fetchDoc(`stock_movements/${movementId}`)).toBeNull();
    expect(number((await fetchDoc('materials/m1')).stockQuantity)).toBe(18);
  });

  it('allows a withdrawal down to exactly zero', async () => {
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    const { movementId } = await movementsLib.logMovement({
      type: 'out',
      material,
      quantity: '18',
      reason: 'Project Usage',
    });

    const movement = await waitForDoc(`stock_movements/${movementId}`);
    expect(number(movement.afterQty)).toBe(0);

    const updated = await waitFor(async () => {
      const fields = await fetchDoc('materials/m1');
      return number(fields.stockQuantity) === 0 ? fields : null;
    });
    expect(number(updated.stockQuantity)).toBe(0);
  });
});

// ============================================================
// HISTORY IS PERMANENT
// ============================================================

describe('movement history', () => {
  it('cannot be edited or deleted once written', async () => {
    const uid = await signInAs('gm@example.com', 'general_manager');
    const material = (await materialsLib.loadCatalog()).materials[0];

    const { movementId } = await movementsLib.logMovement({
      type: 'in',
      material,
      quantity: '5',
      reason: 'Purchase',
    });
    await waitForDoc(`stock_movements/${movementId}`);

    const { doc, updateDoc, deleteDoc } = await import('firebase/firestore');
    const { db } = await import('../../app-firebase/src/lib/firebase.js');

    // A manager is the highest role that uses the app day to day, and even
    // they cannot rewrite what happened.
    await expect(
      updateDoc(doc(db, 'stock_movements', movementId), { quantity: 1 })
    ).rejects.toThrow(/permission|insufficient/i);
    await expect(
      deleteDoc(doc(db, 'stock_movements', movementId))
    ).rejects.toThrow(/permission|insufficient/i);

    expect(number((await fetchDoc(`stock_movements/${movementId}`)).quantity)).toBe(5);
  });

  it('is readable by staff, since it holds no cost or supplier data', async () => {
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    await movementsLib.logMovement({ type: 'in', material, quantity: '5', reason: 'Purchase' });

    const page = await waitFor(async () => {
      const result = await movementsLib.loadMovements({});
      return result.movements.length > 0 ? result : null;
    });

    expect(page.movements[0].materialName).toBe('Mahogany Plank');
    expect(page.hasMore).toBe(false);
  });

  it('filters by type and by material', async () => {
    await signInAs('staff@example.com', 'production_staff');
    await seedMaterial('m2', { name: 'Marine Plywood', stock: 40, threshold: 20, unit: 'sheet' });

    const catalog = await materialsLib.loadCatalog();
    const plank = catalog.materials.find((m) => m.name === 'Mahogany Plank');
    const plywood = catalog.materials.find((m) => m.name === 'Marine Plywood');

    await movementsLib.logMovement({ type: 'in', material: plank, quantity: '5', reason: 'Purchase' });
    await movementsLib.logMovement({ type: 'out', material: plank, quantity: '2', reason: 'Damaged' });
    await movementsLib.logMovement({ type: 'in', material: plywood, quantity: '10', reason: 'Purchase' });

    await waitFor(async () => {
      const all = await movementsLib.loadMovements({});
      return all.movements.length === 3 ? all : null;
    });

    const ins = await movementsLib.loadMovements({ type: 'in' });
    expect(ins.movements).toHaveLength(2);

    const outs = await movementsLib.loadMovements({ type: 'out' });
    expect(outs.movements).toHaveLength(1);

    const plankOnly = await movementsLib.loadMovements({ materialId: plank.id });
    expect(plankOnly.movements).toHaveLength(2);

    const plankIns = await movementsLib.loadMovements({ materialId: plank.id, type: 'in' });
    expect(plankIns.movements).toHaveLength(1);
  });

  it('filters by date range', async () => {
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    await movementsLib.logMovement({ type: 'in', material, quantity: '5', reason: 'Purchase' });

    await waitFor(async () => {
      const all = await movementsLib.loadMovements({});
      return all.movements.length === 1 ? all : null;
    });

    const today = new Date();
    const iso = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    const includingToday = await movementsLib.loadMovements({ dateFrom: iso(today), dateTo: iso(today) });
    expect(includingToday.movements).toHaveLength(1);

    const lastYear = new Date(today);
    lastYear.setFullYear(today.getFullYear() - 1);
    const excludingToday = await movementsLib.loadMovements({
      dateFrom: iso(lastYear),
      dateTo: iso(lastYear),
    });
    expect(excludingToday.movements).toHaveLength(0);
  });
});
