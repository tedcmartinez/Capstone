// The audit trail, end to end
//
// Reading the trail back with each filter, paging through it, and checking
// that the export is itself recorded. Run against the emulators with the
// real firestore.rules, so the manager-only read is genuinely enforced.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { withRequirements } from './requirements.js';

globalThis.__CORNERBLOCK_USE_EMULATORS__ = true;

const PROJECT_ID = 'cornerblock-inventory';
const OWNER = { Authorization: 'Bearer owner' };

let auth;
let authLib;
let session;
let materialsLib;
let movementsLib;
let trail;
let auditLib;
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
  // logMovement() fills in the receipt and project every new movement
  // needs, unless the test gives its own (see requirements.js)
  const movementsModule = await import('../../app-firebase/src/lib/movements.js');
  movementsLib = {
    ...movementsModule,
    logMovement: (args) => movementsModule.logMovement(withRequirements(args)),
  };
  trail = await import('../../app-firebase/src/lib/auditTrail.js');
  auditLib = await import('../../app-firebase/src/lib/audit.js');
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

  await seedMaterial('m1', 'Mahogany Plank', 18);
  await seedMaterial('m2', 'Marine Plywood 18mm', 40);
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

function seedMaterial(id, name, stock) {
  return seed(`materials/${id}`, {
    name: { stringValue: name },
    category: { stringValue: 'wood' },
    unit: { stringValue: 'pcs' },
    size: { stringValue: '' },
    stockQuantity: { integerValue: String(stock) },
    minThreshold: { integerValue: '10' },
    notes: { stringValue: '' },
    isArchived: { booleanValue: false },
    lastAuditId: { stringValue: 'seed' },
  });
}

async function signInAs(email, role, name) {
  const credential = await firebaseAuth.createUserWithEmailAndPassword(auth, email, 'Password2026');

  await seed(`users/${credential.user.uid}`, {
    name: { stringValue: name },
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

async function switchTo(email) {
  await auth.signOut();
  session.clearCurrentUser();
  await authLib.signInWithEmail(email, 'Password2026');
}

// Some history: the staff member moves both materials, the manager edits one
async function buildHistory() {
  const staffUid = await signInAs('juan@example.com', 'production_staff', 'Juan Dela Cruz');

  let catalog = await materialsLib.loadCatalog();
  const plank = () => catalog.materials.find((m) => m.id === 'm1');
  const plywood = () => catalog.materials.find((m) => m.id === 'm2');

  await movementsLib.logMovement({ type: 'out', material: plank(), quantity: '3', reason: 'Project Usage' });
  catalog = await materialsLib.loadCatalog();
  await movementsLib.logMovement({ type: 'in', material: plywood(), quantity: '10', reason: 'Purchase' });
  catalog = await materialsLib.loadCatalog();
  await movementsLib.logMovement({ type: 'out', material: plywood(), quantity: '4', reason: 'Damaged' });

  await auth.signOut();
  session.clearCurrentUser();

  const gmUid = await signInAs('gm@example.com', 'general_manager', 'Shop Manager');
  catalog = await materialsLib.loadCatalog();
  await materialsLib.updateMaterial('m1', plank(), {
    name: 'Mahogany Plank',
    category: 'wood',
    size: '',
    unit: 'pcs',
    minThreshold: '25',
    costPerUnit: '',
    supplierId: '',
    notes: '',
  });

  return { staffUid, gmUid };
}

// ============================================================
// THE material FILTER NEEDS materialId ON EACH ENTRY
// ============================================================

describe('what each entry records', () => {
  it('names the material on a stock movement, not only the movement id', async () => {
    // Without this, filtering the trail by material would miss every
    // stock-in, stock-out and adjustment, since their entityId is the
    // movement's own id.
    await buildHistory();

    const { entries } = await trail.loadAuditPage({ action: 'stock.out' });

    expect(entries.length).toBe(2);
    for (const entry of entries) {
      expect(entry.entity).toBe('stock_movements');
      expect(['m1', 'm2']).toContain(entry.materialId);
      expect(entry.entityId).not.toBe(entry.materialId);
    }
  });

  it('names the material on a catalog edit too', async () => {
    await buildHistory();

    const { entries } = await trail.loadAuditPage({ action: 'material.update' });

    expect(entries).toHaveLength(1);
    expect(entries[0].materialId).toBe('m1');
  });

  it('leaves materialId empty where no material is involved', async () => {
    await signInAs('gm@example.com', 'general_manager', 'Shop Manager');
    await materialsLib.createSupplier({ name: 'Sierra Metalworks', viberContact: '', notes: '' });

    const { entries } = await trail.loadAuditPage({ action: 'supplier.create' });

    expect(entries).toHaveLength(1);
    expect(entries[0].materialId).toBeNull();
  });
});

// ============================================================
// FILTERING
// ============================================================

// ============================================================
// ROUND 2: CATEGORY AND DATES IN PHILIPPINE TIME
// ============================================================

describe('filtering the trail by category and day', () => {
  it('filters by a category, as the list of its materials', async () => {
    await buildHistory();

    // Both seeded materials are in "wood"
    const both = await trail.loadAuditPage({ materialIds: ['m1', 'm2'] });
    expect(new Set(both.entries.map((e) => e.materialId))).toEqual(new Set(['m1', 'm2']));

    const one = await trail.loadAuditPage({ materialIds: ['m2'] });
    expect(one.entries.length).toBeGreaterThan(0);
    expect(one.entries.every((e) => e.materialId === 'm2')).toBe(true);
  });

  it('finds nothing for a category with no materials, without asking Firestore', async () => {
    await buildHistory();
    const page = await trail.loadAuditPage({ materialIds: [] });
    expect(page.entries).toEqual([]);
  });

  it('includes everything up to the end of the To day in Philippine time', async () => {
    await buildHistory();
    const { shopToday } = await import('../../app-firebase/src/lib/dates.js');
    const today = shopToday();

    const page = await trail.loadAuditPage({ dateFrom: today, dateTo: today });
    expect(page.entries.length).toBeGreaterThan(0);
  });
});

describe('filtering the trail', () => {
  it('lists newest first', async () => {
    await buildHistory();

    const { entries } = await trail.loadAuditPage({});
    const times = entries.map((e) => e.timestamp.toMillis());

    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('filters by material, catching movements and edits alike', async () => {
    await buildHistory();

    const { entries } = await trail.loadAuditPage({ materialId: 'm1' });
    const actions = entries.map((e) => e.action).sort();

    // The stock-out against it and the threshold edit, nothing about m2
    expect(actions).toEqual(['material.update', 'stock.out']);
  });

  it('filters by user', async () => {
    const { staffUid } = await buildHistory();

    const { entries } = await trail.loadAuditPage({ actorUid: staffUid });

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.actorUid === staffUid)).toBe(true);
  });

  it('filters by action', async () => {
    await buildHistory();

    const { entries } = await trail.loadAuditPage({ action: 'stock.in' });

    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toContain('Marine Plywood');
  });

  it('combines user, action and material', async () => {
    const { staffUid } = await buildHistory();

    const { entries } = await trail.loadAuditPage({
      actorUid: staffUid,
      action: 'stock.out',
      materialId: 'm2',
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].summary).toContain('Damaged');
  });

  it('filters by date, whole days inclusive', async () => {
    await buildHistory();

    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const todays = await trail.loadAuditPage({ dateFrom: iso, dateTo: iso });
    expect(todays.entries.length).toBeGreaterThan(0);

    const lastYear = `${today.getFullYear() - 1}-01-01`;
    const old = await trail.loadAuditPage({ dateFrom: lastYear, dateTo: lastYear });
    expect(old.entries).toHaveLength(0);
  });

  it('combines a date range with another filter', async () => {
    await buildHistory();

    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const { entries } = await trail.loadAuditPage({ dateFrom: iso, dateTo: iso, action: 'stock.out' });
    expect(entries).toHaveLength(2);
  });
});

// ============================================================
// PAGING AND EXPORTING EVERYTHING
// ============================================================

describe('paging', () => {
  it('pages fifty at a time and says whether there is more', async () => {
    await signInAs('gm@example.com', 'general_manager', 'Shop Manager');

    // 55 sign-in style events, the cheapest entries to create
    for (let i = 0; i < 55; i += 1) {
      await auditLib.auditedWrite([], {
        action: 'auth.login',
        entity: 'auth',
        entityId: 'x',
        summary: `Event ${i}`,
      });
    }

    const first = await trail.loadAuditPage({ action: 'auth.login' });
    expect(first.entries).toHaveLength(50);
    expect(first.hasMore).toBe(true);

    const second = await trail.loadAuditPage({ action: 'auth.login' }, first.lastDoc);
    // 55 written, 50 on the first page. signInAs() seeds the user document
    // directly, so signing in here writes no login entry of its own.
    expect(second.entries).toHaveLength(5);
    expect(second.hasMore).toBe(false);

    // No entry appears on both pages
    const firstIds = new Set(first.entries.map((e) => e.id));
    expect(second.entries.some((e) => firstIds.has(e.id))).toBe(false);
  });

  it('reads every matching entry for an export, not only one page', async () => {
    await signInAs('gm@example.com', 'general_manager', 'Shop Manager');

    for (let i = 0; i < 60; i += 1) {
      await auditLib.auditedWrite([], { action: 'auth.login', entity: 'auth', summary: `Event ${i}` });
    }

    const { entries, truncated } = await trail.loadAllAudit({ action: 'auth.login' });

    expect(entries).toHaveLength(60);
    expect(truncated).toBe(false);
  });
});

// ============================================================
// WHO MAY READ IT
// ============================================================

describe('reading the trail', () => {
  it('is refused for production staff', async () => {
    await buildHistory();
    await switchTo('juan@example.com');

    // Asserted on the error code rather than the message. When a refused
    // rule involves a document lookup, which isGM() does, the emulator
    // words the message as an evaluation report rather than "permission
    // denied", but the code is the same and so is the outcome.
    let refusal = null;
    try {
      await trail.loadAuditPage({});
    } catch (error) {
      refusal = error;
    }

    expect(refusal).not.toBeNull();
    expect(refusal.code).toBe('permission-denied');
  });

  it('is allowed for the manager', async () => {
    await buildHistory();

    const { entries } = await trail.loadAuditPage({});
    expect(entries.length).toBeGreaterThan(0);
  });
});

// ============================================================
// THE EXPORT IS RECORDED
// ============================================================

describe('recording an export', () => {
  it('writes an audit.export entry with the filters and the row count', async () => {
    await signInAs('gm@example.com', 'general_manager', 'Shop Manager');

    await auditLib.auditedWrite([], {
      action: 'audit.export',
      entity: 'audit_logs',
      entityId: null,
      after: {
        destination: 'CSV download',
        rowCount: 42,
        filters: { from: '2026-10-01', action: 'Stock out' },
      },
      summary: 'Exported 42 audit trail entries to CSV download (filtered)',
    });

    const { entries } = await trail.loadAuditPage({ action: 'audit.export' });

    expect(entries).toHaveLength(1);
    expect(entries[0].after.rowCount).toBe(42);
    expect(entries[0].after.filters).toEqual({ from: '2026-10-01', action: 'Stock out' });
    expect(entries[0].actorRole).toBe('general_manager');
  });

  it('produces export rows that match the entries one for one', async () => {
    await buildHistory();

    const { entries } = await trail.loadAllAudit({ materialId: 'm2' });
    const rows = trail.exportRows(entries);

    expect(rows).toHaveLength(entries.length);
    expect(rows.every((row) => row.length === trail.EXPORT_HEADER.length)).toBe(true);
  });
});
