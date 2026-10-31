// Stale writes and the stock arithmetic
//
// The system logs movements with a batch rather than a transaction, so that
// a withdrawal can still be entered while the office internet is down. The
// price of that choice is that the browser calculates the new total from a
// copy of the material which may be out of date.
//
// These tests are what make that price acceptable. They prove the server
// refuses a movement built on a stale figure, so the batch cannot produce a
// wrong total even though it never read the material under a lock.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

globalThis.__CORNERBLOCK_USE_EMULATORS__ = true;

const PROJECT_ID = 'cornerblock-inventory';
const OWNER = { Authorization: 'Bearer owner' };

let auth;
let db;
let authLib;
let session;
let materialsLib;
let movementsLib;
let firebaseAuth;
let firestore;

beforeAll(async () => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

  const firebaseModule = await import('../../app-firebase/src/lib/firebase.js');
  auth = firebaseModule.auth;
  db = firebaseModule.db;

  firestore = await import('firebase/firestore');
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

  await seed('materials/m1', {
    name: { stringValue: 'Mahogany Plank' },
    category: { stringValue: 'wood' },
    unit: { stringValue: 'pcs' },
    size: { stringValue: '' },
    stockQuantity: { integerValue: '18' },
    minThreshold: { integerValue: '30' },
    notes: { stringValue: '' },
    isArchived: { booleanValue: false },
    lastAuditId: { stringValue: 'seed' },
  });
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

function number(field) {
  if (!field) return null;
  return Number(field.integerValue ?? field.doubleValue);
}

async function stockQuantity() {
  return number((await fetchDoc('materials/m1')).stockQuantity);
}

async function signInAs(email, role) {
  const credential = await firebaseAuth.createUserWithEmailAndPassword(auth, email, 'Password2026');

  await seed(`users/${credential.user.uid}`, {
    name: { stringValue: email === 'gm@example.com' ? 'Shop Manager' : 'Juan Dela Cruz' },
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

// Builds the exact batch logMovement() builds, but from a quantity supplied
// by the caller rather than read fresh. This is what lets a stale starting
// figure be simulated: two batches can be prepared from the same number
// before either is committed, which is what happens when two people work
// from the same screen, or when one entry was typed offline.
function buildMovementBatch({ uid, type, quantity, beforeQty, unit = 'pcs' }) {
  const { doc, collection, writeBatch, serverTimestamp } = firestore;

  const auditId = doc(collection(db, 'audit_logs')).id;
  const movementId = doc(collection(db, 'stock_movements')).id;
  const afterQty = type === 'in' ? beforeQty + quantity : beforeQty - quantity;

  const batch = writeBatch(db);

  batch.set(doc(db, 'stock_movements', movementId), {
    materialId: 'm1',
    materialName: 'Mahogany Plank',
    type,
    quantity,
    beforeQty,
    afterQty,
    movementDate: '2026-11-01',
    reason: type === 'in' ? 'Purchase' : 'Project Usage',
    reference: '',
    notes: '',
    receiptId: null,
    loggedBy: uid,
    loggedByName: 'Juan Dela Cruz',
    createdAt: serverTimestamp(),
    lastAuditId: auditId,
  });

  batch.update(doc(db, 'materials', 'm1'), {
    stockQuantity: afterQty,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    lastMovementId: movementId,
    lastAuditId: auditId,
  });

  batch.set(doc(db, 'audit_logs', auditId), {
    action: type === 'in' ? 'stock.in' : 'stock.out',
    entity: 'stock_movements',
    entityId: movementId,
    actorUid: uid,
    actorEmail: 'staff@example.com',
    actorName: 'Juan Dela Cruz',
    actorRole: 'production_staff',
    before: { stockQuantity: beforeQty },
    after: { stockQuantity: afterQty },
    summary: `Stock ${type} ${quantity} ${unit}, Mahogany Plank`,
    timestamp: serverTimestamp(),
    appVersion: '2.0.0',
  });

  return { batch, movementId, auditId, afterQty };
}

async function commitExpectingRejection(batch) {
  try {
    await batch.commit();
    return null;
  } catch (error) {
    return error;
  }
}

// ============================================================
// TWO WRITES FROM THE SAME CACHED QUANTITY
// ============================================================

describe('two batches built from the same cached quantity', () => {
  it('accepts the first and rejects the second, leaving the correct total', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    // Both are prepared while the material still reads 18, which is the
    // situation the batch approach cannot prevent on the client: two people
    // on the same starting figure, or one entry queued offline.
    const first = buildMovementBatch({ uid, type: 'out', quantity: 5, beforeQty: 18 });
    const second = buildMovementBatch({ uid, type: 'out', quantity: 4, beforeQty: 18 });

    // The first succeeds and moves the server to 13
    await first.batch.commit();
    expect(await stockQuantity()).toBe(13);

    // The second claims to have started from 18, which is no longer true,
    // so the server refuses it outright.
    const error = await commitExpectingRejection(second.batch);
    expect(error).not.toBeNull();
    expect(String(error)).toMatch(/permission|insufficient/i);

    // The total is the one the accepted movement produced, not the stale
    // 14 the second write would have written.
    expect(await stockQuantity()).toBe(13);

    // And the rejected movement left nothing behind at all
    expect(await fetchDoc(`stock_movements/${second.movementId}`)).toBeNull();
    expect(await fetchDoc(`audit_logs/${second.auditId}`)).toBeNull();

    // Exactly one movement is on record
    const movements = await listCollection('stock_movements');
    expect(movements).toHaveLength(1);
    expect(number(movements[0].fields.afterQty)).toBe(13);
  });

  it('rejects the stale write for a stock-in just the same', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    const first = buildMovementBatch({ uid, type: 'in', quantity: 50, beforeQty: 18 });
    const second = buildMovementBatch({ uid, type: 'in', quantity: 10, beforeQty: 18 });

    await first.batch.commit();
    expect(await stockQuantity()).toBe(68);

    expect(await commitExpectingRejection(second.batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(68);
  });

  it('lets the second write through once it is rebuilt from the real figure', async () => {
    // This is what the interface does after a failed sync: the movement is
    // entered again, now starting from the quantity that is actually there.
    const uid = await signInAs('staff@example.com', 'production_staff');

    const first = buildMovementBatch({ uid, type: 'out', quantity: 5, beforeQty: 18 });
    await first.batch.commit();

    const stale = buildMovementBatch({ uid, type: 'out', quantity: 4, beforeQty: 18 });
    expect(await commitExpectingRejection(stale.batch)).not.toBeNull();

    const retried = buildMovementBatch({ uid, type: 'out', quantity: 4, beforeQty: 13 });
    await retried.batch.commit();

    expect(await stockQuantity()).toBe(9);
    expect(await listCollection('stock_movements')).toHaveLength(2);
  });
});

// ============================================================
// beforeQty MUST MATCH THE SERVER
// ============================================================

describe('beforeQty against the server quantity', () => {
  it('refuses a movement claiming a higher starting quantity than exists', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    // Claiming 100 on hand would let a withdrawal of 30 look legitimate
    const { batch } = buildMovementBatch({ uid, type: 'out', quantity: 30, beforeQty: 100 });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('refuses a movement claiming a lower starting quantity than exists', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');
    const { batch } = buildMovementBatch({ uid, type: 'in', quantity: 5, beforeQty: 2 });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('accepts a movement whose beforeQty is exactly right', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');
    const { batch } = buildMovementBatch({ uid, type: 'out', quantity: 3, beforeQty: 18 });

    await batch.commit();
    expect(await stockQuantity()).toBe(15);
  });
});

// ============================================================
// THE ARITHMETIC MUST BE RIGHT
// ============================================================

describe('the movement arithmetic', () => {
  // These write the batch by hand with figures that do not add up, which a
  // tampered browser could do. Each must be refused.
  function buildBrokenBatch({ uid, type, quantity, beforeQty, afterQty, materialQty }) {
    const { doc, collection, writeBatch, serverTimestamp } = firestore;

    const auditId = doc(collection(db, 'audit_logs')).id;
    const movementId = doc(collection(db, 'stock_movements')).id;
    const batch = writeBatch(db);

    batch.set(doc(db, 'stock_movements', movementId), {
      materialId: 'm1',
      materialName: 'Mahogany Plank',
      type,
      quantity,
      beforeQty,
      afterQty,
      movementDate: '2026-11-01',
      reason: 'Project Usage',
      reference: '',
      notes: '',
      receiptId: null,
      loggedBy: uid,
      loggedByName: 'Juan Dela Cruz',
      createdAt: serverTimestamp(),
      lastAuditId: auditId,
    });
    batch.update(doc(db, 'materials', 'm1'), {
      stockQuantity: materialQty,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      lastMovementId: movementId,
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
      summary: 'Broken arithmetic',
      timestamp: serverTimestamp(),
      appVersion: '2.0.0',
    });

    return { batch, movementId };
  }

  it('refuses an afterQty that does not follow from the quantity', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    // Withdrawing 5 from 18 should leave 13, not 17
    const { batch } = buildBrokenBatch({
      uid, type: 'out', quantity: 5, beforeQty: 18, afterQty: 17, materialQty: 17,
    });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('refuses a stock-out that adds instead of subtracting', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');
    const { batch } = buildBrokenBatch({
      uid, type: 'out', quantity: 5, beforeQty: 18, afterQty: 23, materialQty: 23,
    });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('refuses a material total that disagrees with the movement afterQty', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    // The movement adds up on its own, but the material is set to something
    // else entirely, which is how a quantity could be inflated quietly.
    const { batch } = buildBrokenBatch({
      uid, type: 'out', quantity: 5, beforeQty: 18, afterQty: 13, materialQty: 500,
    });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });
});

// ============================================================
// A QUANTITY CANNOT CHANGE WITHOUT A MOVEMENT
//
// This was a real gap before these rules: the staff branch of the materials
// update rule allowed stockQuantity to change with only an audit entry, and
// no movement document was required to exist at all.
// ============================================================

describe('changing a quantity with no movement filed', () => {
  async function attemptBareQuantityChange(uid, newQuantity, extra = {}) {
    const { doc, collection, writeBatch, serverTimestamp } = firestore;

    const auditId = doc(collection(db, 'audit_logs')).id;
    const batch = writeBatch(db);

    batch.update(doc(db, 'materials', 'm1'), {
      stockQuantity: newQuantity,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      lastAuditId: auditId,
      ...extra,
    });
    batch.set(doc(db, 'audit_logs', auditId), {
      action: 'stock.in',
      entity: 'materials',
      entityId: 'm1',
      actorUid: uid,
      actorEmail: 'staff@example.com',
      actorName: 'Juan Dela Cruz',
      actorRole: 'production_staff',
      summary: 'Quantity rewritten with no movement',
      timestamp: serverTimestamp(),
      appVersion: '2.0.0',
    });

    return commitExpectingRejection(batch);
  }

  it('is refused for staff', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    expect(await attemptBareQuantityChange(uid, 9999)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('is refused for a manager as well', async () => {
    // A quantity is the result of recorded movements, so not even a manager
    // may type over it. This matches the LAN system, whose Material::update()
    // deliberately left the column out.
    const uid = await signInAs('gm@example.com', 'general_manager');

    expect(await attemptBareQuantityChange(uid, 9999)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('is refused even when naming a movement that does not exist', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    expect(
      await attemptBareQuantityChange(uid, 9999, { lastMovementId: 'made-up-id' })
    ).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('is refused when naming a movement for a different material', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    await seed('materials/m2', {
      name: { stringValue: 'Marine Plywood' },
      category: { stringValue: 'plywood' },
      unit: { stringValue: 'sheet' },
      stockQuantity: { integerValue: '40' },
      minThreshold: { integerValue: '20' },
      isArchived: { booleanValue: false },
      lastAuditId: { stringValue: 'seed' },
    });

    const { doc, collection, writeBatch, serverTimestamp } = firestore;
    const auditId = doc(collection(db, 'audit_logs')).id;
    const movementId = doc(collection(db, 'stock_movements')).id;
    const batch = writeBatch(db);

    // A legitimate movement against m2
    batch.set(doc(db, 'stock_movements', movementId), {
      materialId: 'm2',
      materialName: 'Marine Plywood',
      type: 'in',
      quantity: 5,
      beforeQty: 40,
      afterQty: 45,
      movementDate: '2026-11-01',
      reason: 'Purchase',
      reference: '',
      notes: '',
      receiptId: null,
      loggedBy: uid,
      loggedByName: 'Juan Dela Cruz',
      createdAt: serverTimestamp(),
      lastAuditId: auditId,
    });
    // But pointed at m1, to move a quantity it has nothing to do with
    batch.update(doc(db, 'materials', 'm1'), {
      stockQuantity: 9999,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      lastMovementId: movementId,
      lastAuditId: auditId,
    });
    batch.set(doc(db, 'audit_logs', auditId), {
      action: 'stock.in',
      entity: 'stock_movements',
      entityId: movementId,
      actorUid: uid,
      actorEmail: 'staff@example.com',
      actorName: 'Juan Dela Cruz',
      actorRole: 'production_staff',
      summary: 'Movement pointed at the wrong material',
      timestamp: serverTimestamp(),
      appVersion: '2.0.0',
    });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });
});

// ============================================================
// THE NORMAL PATH STILL WORKS
//
// All of the above adds several document lookups to the rules, and a batched
// write may make only twenty. These confirm the ordinary cases still fit,
// including a stock-in carrying a receipt, which is the largest batch the
// app ever commits.
// ============================================================

describe('the ordinary path, with the new checks in place', () => {
  it('logs a movement through the application code', async () => {
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    const { movementId, afterQty } = await movementsLib.logMovement({
      type: 'out',
      material,
      quantity: '5',
      reason: 'Project Usage',
      reference: 'order #102',
    });

    expect(afterQty).toBe(13);
    expect(await fetchDoc(`stock_movements/${movementId}`)).not.toBeNull();
    expect(await stockQuantity()).toBe(13);
  });

  it('logs a stock-in with a receipt, the largest batch the app writes', async () => {
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    // Four documents in one batch: movement, material, receipt, audit entry.
    // The compression itself needs a browser canvas, so a already-compressed
    // receipt is handed in directly here.
    const { movementId, receiptId } = await movementsLib.logMovement({
      type: 'in',
      material,
      quantity: '50',
      reason: 'Purchase',
      reference: 'PO-1042',
      receipt: {
        mimeType: 'image/jpeg',
        base64: 'x'.repeat(2000),
        sizeBytes: 150000,
        width: 1280,
        height: 960,
        originalBytes: 2400000,
      },
    });

    expect(receiptId).not.toBeNull();
    expect(await fetchDoc(`stock_movements/${movementId}`)).not.toBeNull();
    expect(await fetchDoc(`receipts/${receiptId}`)).not.toBeNull();
    expect(await stockQuantity()).toBe(68);
  });

  it('still lets a manager edit the catalog without touching the quantity', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const existing = (await materialsLib.loadCatalog()).materials[0];

    await materialsLib.updateMaterial('m1', existing, {
      name: 'Mahogany Plank',
      category: 'wood',
      size: '1x4x8ft',
      unit: 'pcs',
      minThreshold: '40',
      costPerUnit: '',
      supplierId: '',
      notes: '',
    });

    const material = await fetchDoc('materials/m1');
    expect(number(material.minThreshold)).toBe(40);
    // Untouched by a catalog edit
    expect(number(material.stockQuantity)).toBe(18);
  });

  it('still lets a manager archive a material', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const existing = (await materialsLib.loadCatalog()).materials[0];

    await materialsLib.archiveMaterial('m1', existing);

    expect((await fetchDoc('materials/m1')).isArchived.booleanValue).toBe(true);
  });
});
