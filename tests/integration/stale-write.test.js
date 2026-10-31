// Concurrent and late-arriving writes
//
// The system records a stock-in or stock-out as a relative change, applied
// with increment(), so that an entry typed while the office connection was
// down still applies correctly when it syncs. An adjustment is the opposite:
// the manager is setting an absolute counted figure, so it is only accepted
// while the figure they counted from is still the one on the server.
//
// These tests hold both halves of that in place. The important one is the
// first: two withdrawals of five, both entered against a total of eighteen,
// must both apply and leave eight.

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

  await seedMaterial('m1', 18);
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

function seedMaterial(id, stock) {
  return seed(`materials/${id}`, {
    name: { stringValue: 'Mahogany Plank' },
    category: { stringValue: 'wood' },
    unit: { stringValue: 'pcs' },
    size: { stringValue: '' },
    stockQuantity: { integerValue: String(stock) },
    minThreshold: { integerValue: '30' },
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

function number(field) {
  if (!field) return null;
  return Number(field.integerValue ?? field.doubleValue);
}

async function stockQuantity(id = 'm1') {
  return number((await fetchDoc(`materials/${id}`)).stockQuantity);
}

async function signInAs(email, role) {
  const credential = await firebaseAuth.createUserWithEmailAndPassword(auth, email, 'Password2026');

  await seed(`users/${credential.user.uid}`, {
    name: { stringValue: role === 'production_staff' ? 'Juan Dela Cruz' : 'Shop Manager' },
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

// Builds the batch the app builds for a stock-in or stock-out, from a
// starting figure supplied by the caller rather than read fresh.
//
// This is how an offline entry is simulated: two batches can be prepared
// from the same number before either is committed, which is exactly what
// happens when the connection is down and two entries are typed, or when
// two people work from the same screen.
function buildMovementBatch({ uid, type, quantity, recordedBefore, materialId = 'm1' }) {
  const { doc, collection, writeBatch, serverTimestamp, increment } = firestore;

  const auditId = doc(collection(db, 'audit_logs')).id;
  const movementId = doc(collection(db, 'stock_movements')).id;
  const recordedAfter = type === 'in' ? recordedBefore + quantity : recordedBefore - quantity;

  const batch = writeBatch(db);

  batch.set(doc(db, 'stock_movements', movementId), {
    materialId,
    materialName: 'Mahogany Plank',
    type,
    quantity,
    // What the device saw. Not what the change is based on.
    beforeQty: recordedBefore,
    afterQty: recordedAfter,
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

  // The change itself, as a delta resolved by the server
  batch.update(doc(db, 'materials', materialId), {
    stockQuantity: increment(type === 'in' ? quantity : -quantity),
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
    before: { stockQuantity: recordedBefore },
    after: { stockQuantity: recordedAfter },
    summary: `Stock ${type} ${quantity} pcs, Mahogany Plank`,
    timestamp: serverTimestamp(),
    appVersion: '2.0.0',
  });

  return { batch, movementId, auditId };
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
// OFFLINE ENTRIES MUST BOTH APPLY
// ============================================================

describe('two entries made against the same starting figure', () => {
  it('both apply, and eighteen less five twice is eight', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    // Both prepared while the material still read 18, which is what happens
    // when the connection is down and two withdrawals are typed in a row.
    const first = buildMovementBatch({ uid, type: 'out', quantity: 5, recordedBefore: 18 });
    const second = buildMovementBatch({ uid, type: 'out', quantity: 5, recordedBefore: 18 });

    await first.batch.commit();
    await second.batch.commit();

    // Each withdrawal is a statement about what physically happened, so both
    // count. Ten planks left the shelf.
    expect(await stockQuantity()).toBe(8);

    // And both are on record
    const movements = await listCollection('stock_movements');
    expect(movements).toHaveLength(2);
    expect(await fetchDoc(`stock_movements/${first.movementId}`)).not.toBeNull();
    expect(await fetchDoc(`stock_movements/${second.movementId}`)).not.toBeNull();
  });

  it('keeps what each device recorded, even where it no longer matches', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    const first = buildMovementBatch({ uid, type: 'out', quantity: 5, recordedBefore: 18 });
    const second = buildMovementBatch({ uid, type: 'out', quantity: 5, recordedBefore: 18 });

    await first.batch.commit();
    await second.batch.commit();

    // The second entry still says it went from 18 to 13, because that is
    // what the person saw. The real total went from 13 to 8. The interface
    // labels these figures "on screen" rather than presenting them as the
    // system's arithmetic.
    const secondMovement = await fetchDoc(`stock_movements/${second.movementId}`);
    expect(number(secondMovement.beforeQty)).toBe(18);
    expect(number(secondMovement.afterQty)).toBe(13);

    // The total is what actually happened
    expect(await stockQuantity()).toBe(8);
  });

  it('mixes deliveries and withdrawals from the same figure correctly', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    const out = buildMovementBatch({ uid, type: 'out', quantity: 5, recordedBefore: 18 });
    const incoming = buildMovementBatch({ uid, type: 'in', quantity: 50, recordedBefore: 18 });
    const out2 = buildMovementBatch({ uid, type: 'out', quantity: 3, recordedBefore: 18 });

    await out.batch.commit();
    await incoming.batch.commit();
    await out2.batch.commit();

    // 18 - 5 + 50 - 3
    expect(await stockQuantity()).toBe(60);
    expect(await listCollection('stock_movements')).toHaveLength(3);
  });

  it('applies three withdrawals queued together', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    const batches = [4, 4, 4].map((quantity) =>
      buildMovementBatch({ uid, type: 'out', quantity, recordedBefore: 18 })
    );

    for (const entry of batches) await entry.batch.commit();

    expect(await stockQuantity()).toBe(6);
  });
});

// ============================================================
// THE ONE REJECTION LEFT: BELOW ZERO
// ============================================================

describe('a withdrawal that would go below zero', () => {
  it('is refused, measured against the live total rather than the recorded one', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    // Two withdrawals of 10 are each fine against the 18 on screen, but
    // together they come to more than there is.
    const first = buildMovementBatch({ uid, type: 'out', quantity: 10, recordedBefore: 18 });
    const second = buildMovementBatch({ uid, type: 'out', quantity: 10, recordedBefore: 18 });

    await first.batch.commit();
    expect(await stockQuantity()).toBe(8);

    // The second would leave minus two, so the server refuses it. This is
    // the only case the shop will see refused, and it goes to the red
    // failed-sync bar naming the entry to re-enter.
    const error = await commitExpectingRejection(second.batch);
    expect(error).not.toBeNull();
    expect(String(error)).toMatch(/permission|insufficient/i);

    // Nothing partial was left behind
    expect(await stockQuantity()).toBe(8);
    expect(await fetchDoc(`stock_movements/${second.movementId}`)).toBeNull();
    expect(await fetchDoc(`audit_logs/${second.auditId}`)).toBeNull();
    expect(await listCollection('stock_movements')).toHaveLength(1);
  });

  it('allows a withdrawal down to exactly zero', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');
    const { batch } = buildMovementBatch({ uid, type: 'out', quantity: 18, recordedBefore: 18 });

    await batch.commit();
    expect(await stockQuantity()).toBe(0);
  });

  it('refuses a single withdrawal larger than the live total', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');
    const { batch } = buildMovementBatch({ uid, type: 'out', quantity: 25, recordedBefore: 18 });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });
});

// ============================================================
// THE DELTA MUST MATCH THE MOVEMENT
// ============================================================

describe('the change applied against what the movement claims', () => {
  // A tampered browser could increment by one figure while recording
  // another. The rules compare the two.
  function buildMismatchedBatch({ uid, quantity, appliedDelta }) {
    const { doc, collection, writeBatch, serverTimestamp, increment } = firestore;

    const auditId = doc(collection(db, 'audit_logs')).id;
    const movementId = doc(collection(db, 'stock_movements')).id;
    const batch = writeBatch(db);

    batch.set(doc(db, 'stock_movements', movementId), {
      materialId: 'm1',
      materialName: 'Mahogany Plank',
      type: 'out',
      quantity,
      beforeQty: 18,
      afterQty: 18 - quantity,
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
      stockQuantity: increment(appliedDelta),
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
      summary: 'Mismatched delta',
      timestamp: serverTimestamp(),
      appVersion: '2.0.0',
    });

    return { batch, movementId };
  }

  it('refuses a withdrawal that takes away less than it claims', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');
    const { batch } = buildMismatchedBatch({ uid, quantity: 5, appliedDelta: -1 });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('refuses a withdrawal that adds stock instead of removing it', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');
    const { batch } = buildMismatchedBatch({ uid, quantity: 5, appliedDelta: 5 });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('refuses a movement whose own figures do not add up', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    const { doc, collection, writeBatch, serverTimestamp, increment } = firestore;
    const auditId = doc(collection(db, 'audit_logs')).id;
    const movementId = doc(collection(db, 'stock_movements')).id;
    const batch = writeBatch(db);

    batch.set(doc(db, 'stock_movements', movementId), {
      materialId: 'm1',
      materialName: 'Mahogany Plank',
      type: 'out',
      quantity: 5,
      beforeQty: 18,
      // Should be 13
      afterQty: 17,
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
      stockQuantity: increment(-5),
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
      summary: 'Inconsistent movement',
      timestamp: serverTimestamp(),
      appVersion: '2.0.0',
    });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });
});

// ============================================================
// ADJUSTMENTS: ABSOLUTE, MANAGER ONLY, AND STRICT
// ============================================================

describe('stock adjustments', () => {
  it('records the counted figure and the difference', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const material = (await materialsLib.loadCatalog()).materials[0];

    const result = await movementsLib.adjustStock({
      material,
      countedQuantity: 15,
      reason: 'Physical Count',
      notes: 'Counted during the monthly check',
    });

    expect(result.difference).toBe(-3);

    const movement = await fetchDoc(`stock_movements/${result.movementId}`);
    expect(movement.type.stringValue).toBe('adjust');
    expect(number(movement.beforeQty)).toBe(18);
    expect(number(movement.afterQty)).toBe(15);
    expect(number(movement.difference)).toBe(-3);
    // quantity carries the size, so the history and totals read normally
    expect(number(movement.quantity)).toBe(3);
    expect(movement.reason.stringValue).toBe('Physical Count');

    expect(await stockQuantity()).toBe(15);
  });

  it('can correct a figure upward as well', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const material = (await materialsLib.loadCatalog()).materials[0];

    const result = await movementsLib.adjustStock({
      material,
      countedQuantity: 25,
      reason: 'Data Correction',
    });

    expect(result.difference).toBe(7);
    expect(await stockQuantity()).toBe(25);
  });

  it('writes a stock.adjust entry to the audit trail', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const material = (await materialsLib.loadCatalog()).materials[0];

    await movementsLib.adjustStock({
      material,
      countedQuantity: 15,
      reason: 'Damage Found',
    });

    const entries = await listCollection('audit_logs');
    const entry = entries.find((d) => d.fields?.action?.stringValue === 'stock.adjust');

    expect(entry).toBeDefined();
    expect(entry.fields.summary.stringValue).toContain('from 18 to 15');
    expect(entry.fields.summary.stringValue).toContain('Damage Found');
  });

  it('is refused for production staff', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    // Built by hand, since the interface does not offer staff the button
    const { doc, collection, writeBatch, serverTimestamp } = firestore;
    const auditId = doc(collection(db, 'audit_logs')).id;
    const movementId = doc(collection(db, 'stock_movements')).id;
    const batch = writeBatch(db);

    batch.set(doc(db, 'stock_movements', movementId), {
      materialId: 'm1',
      materialName: 'Mahogany Plank',
      type: 'adjust',
      quantity: 3,
      difference: -3,
      beforeQty: 18,
      afterQty: 15,
      movementDate: '2026-11-01',
      reason: 'Physical Count',
      reference: '',
      notes: '',
      receiptId: null,
      loggedBy: uid,
      loggedByName: 'Juan Dela Cruz',
      createdAt: serverTimestamp(),
      lastAuditId: auditId,
    });
    batch.update(doc(db, 'materials', 'm1'), {
      stockQuantity: 15,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      lastMovementId: movementId,
      lastAuditId: auditId,
    });
    batch.set(doc(db, 'audit_logs', auditId), {
      action: 'stock.adjust',
      entity: 'stock_movements',
      entityId: movementId,
      actorUid: uid,
      actorEmail: 'staff@example.com',
      actorName: 'Juan Dela Cruz',
      actorRole: 'production_staff',
      summary: 'Staff attempting an adjustment',
      timestamp: serverTimestamp(),
      appVersion: '2.0.0',
    });

    expect(await commitExpectingRejection(batch)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('is refused when the counted figure is already out of date', async () => {
    // This is why adjustments need a connection. The manager counted against
    // 18, somebody withdrew five in the meantime, and writing 15 now would
    // silently discard that withdrawal.
    const gmUid = await signInAs('gm@example.com', 'general_manager');
    const material = (await materialsLib.loadCatalog()).materials[0];

    // A withdrawal lands first
    const withdrawal = buildMovementBatch({
      uid: gmUid,
      type: 'out',
      quantity: 5,
      recordedBefore: 18,
    });
    await withdrawal.batch.commit();
    expect(await stockQuantity()).toBe(13);

    // The adjustment still believes the total is 18
    await expect(
      movementsLib.adjustStock({ material, countedQuantity: 15, reason: 'Physical Count' })
    ).rejects.toThrow(/permission|insufficient/i);

    // The withdrawal stands, and the stale count changed nothing
    expect(await stockQuantity()).toBe(13);
  });

  it('refuses an adjustment with no reason', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const material = (await materialsLib.loadCatalog()).materials[0];

    await expect(
      movementsLib.adjustStock({ material, countedQuantity: 15, reason: '' })
    ).rejects.toThrow(/reason/i);
  });

  it('refuses an adjustment that changes nothing', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const material = (await materialsLib.loadCatalog()).materials[0];

    await expect(
      movementsLib.adjustStock({ material, countedQuantity: 18, reason: 'Physical Count' })
    ).rejects.toThrow(/nothing to adjust/i);
  });

  it('refuses a negative counted quantity', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const material = (await materialsLib.loadCatalog()).materials[0];

    await expect(
      movementsLib.adjustStock({ material, countedQuantity: -5, reason: 'Physical Count' })
    ).rejects.toThrow(/whole number/i);
  });

  it('cannot be edited or deleted once filed', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const material = (await materialsLib.loadCatalog()).materials[0];

    const result = await movementsLib.adjustStock({
      material,
      countedQuantity: 15,
      reason: 'Physical Count',
    });

    const { doc, updateDoc, deleteDoc } = firestore;

    await expect(
      updateDoc(doc(db, 'stock_movements', result.movementId), { difference: 0 })
    ).rejects.toThrow(/permission|insufficient/i);
    await expect(
      deleteDoc(doc(db, 'stock_movements', result.movementId))
    ).rejects.toThrow(/permission|insufficient/i);
  });
});

// ============================================================
// A QUANTITY STILL CANNOT CHANGE WITHOUT A MOVEMENT
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
      actorEmail: 'x@example.com',
      actorName: 'Someone',
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

  it('is refused for a manager, who must file an adjustment instead', async () => {
    const uid = await signInAs('gm@example.com', 'general_manager');

    expect(await attemptBareQuantityChange(uid, 9999)).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('is refused when naming a movement that does not exist', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');

    expect(
      await attemptBareQuantityChange(uid, 9999, { lastMovementId: 'made-up-id' })
    ).not.toBeNull();
    expect(await stockQuantity()).toBe(18);
  });

  it('is refused when naming a movement for a different material', async () => {
    const uid = await signInAs('staff@example.com', 'production_staff');
    await seedMaterial('m2', 40);

    const { doc, collection, writeBatch, serverTimestamp, increment } = firestore;
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
    // Pointed at m1, to move a quantity it has nothing to do with
    batch.update(doc(db, 'materials', 'm1'), {
      stockQuantity: increment(5),
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
// THE ORDINARY PATHS
// ============================================================

describe('the ordinary paths, with the new checks in place', () => {
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

  it('logs two movements in a row without re-reading in between', async () => {
    // Before the change to increment() this failed: the second entry carried
    // a beforeQty the server had already moved past. Now it simply applies.
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

    await movementsLib.logMovement({ type: 'out', material, quantity: '5', reason: 'Damaged' });
    await movementsLib.logMovement({ type: 'out', material, quantity: '5', reason: 'Damaged' });

    expect(await stockQuantity()).toBe(8);
  });

  it('logs a stock-in with a receipt, the largest batch the app writes', async () => {
    await signInAs('staff@example.com', 'production_staff');
    const material = (await materialsLib.loadCatalog()).materials[0];

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
    expect(number(material.stockQuantity)).toBe(18);
  });

  it('still lets a manager archive a material', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const existing = (await materialsLib.loadCatalog()).materials[0];

    await materialsLib.archiveMaterial('m1', existing);

    expect((await fetchDoc('materials/m1')).isArchived.booleanValue).toBe(true);
  });
});
