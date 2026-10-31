// Materials, costs and suppliers, end to end
//
// These check the part of the role model that the capstone paper is most
// specific about: production staff must not see cost per unit or supplier
// information. The rules tests prove a direct read is refused; these prove
// that the application's own loader respects it, so a staff member's screen
// genuinely has no cost data behind it.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

globalThis.__CORNERBLOCK_USE_EMULATORS__ = true;

const PROJECT_ID = 'cornerblock-inventory';
const OWNER = { Authorization: 'Bearer owner' };

let auth;
let authLib;
let session;
let materialsLib;
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

// Writes resolve against the local cache first, so the server copy is polled
async function waitForDoc(path, { attempts = 40, interval = 50 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const found = await fetchDoc(path);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return null;
}

async function listCollection(name) {
  const response = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/${name}`,
    { headers: OWNER }
  );
  if (!response.ok) return [];
  return (await response.json()).documents || [];
}

async function auditActions() {
  const docs = await listCollection('audit_logs');
  return docs.map((d) => d.fields?.action?.stringValue);
}

async function waitForAudit(action, { attempts = 40, interval = 50 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const actions = await auditActions();
    if (actions.includes(action)) return true;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}

// Creates an account and the matching approved user document, then signs in
async function signInAs(email, role) {
  const credential = await firebaseAuth.createUserWithEmailAndPassword(
    auth,
    email,
    'Password2026'
  );

  await seed(`users/${credential.user.uid}`, {
    name: { stringValue: role === 'general_manager' ? 'Shop Manager' : 'Shop Staff' },
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

// ============================================================
// 6. COST AND SUPPLIER ARE MANAGER ONLY
// ============================================================

describe('what each role can load', () => {
  beforeEach(async () => {
    await seed('materials/m1', {
      name: { stringValue: 'Mahogany Plank' },
      category: { stringValue: 'wood' },
      unit: { stringValue: 'pcs' },
      size: { stringValue: '1x4x8ft' },
      stockQuantity: { integerValue: '18' },
      minThreshold: { integerValue: '30' },
      notes: { stringValue: '' },
      isArchived: { booleanValue: false },
      lastAuditId: { stringValue: 'seed' },
    });
    await seed('material_costs/m1', {
      costPerUnit: { doubleValue: 220 },
      supplierId: { stringValue: 's1' },
      supplierName: { stringValue: 'Antipolo Hardwood Supply' },
      lastAuditId: { stringValue: 'seed' },
    });
    await seed('suppliers/s1', {
      name: { stringValue: 'Antipolo Hardwood Supply' },
      viberContact: { stringValue: '09171234567' },
      notes: { stringValue: '' },
      isArchived: { booleanValue: false },
      lastAuditId: { stringValue: 'seed' },
    });
  });

  it('6. gives the manager the material with its cost and supplier', async () => {
    await signInAs('gm@example.com', 'general_manager');

    const catalog = await materialsLib.loadCatalog();
    const material = catalog.materials.find((m) => m.id === 'm1');

    expect(material.name).toBe('Mahogany Plank');
    expect(material.costPerUnit).toBe(220);
    expect(material.supplierName).toBe('Antipolo Hardwood Supply');
    expect(catalog.suppliers).toHaveLength(1);
  });

  it('6. gives staff the material but no cost and no supplier at all', async () => {
    await signInAs('staff@example.com', 'production_staff');

    const catalog = await materialsLib.loadCatalog();
    const material = catalog.materials.find((m) => m.id === 'm1');

    // The shop floor information is all there
    expect(material.name).toBe('Mahogany Plank');
    expect(material.stockQuantity).toBe(18);
    expect(material.minThreshold).toBe(30);

    // The management information is absent, not blanked out in the page
    expect(material.costPerUnit).toBeNull();
    expect(material.supplierId).toBeNull();
    expect(material.supplierName).toBeNull();
    expect(catalog.suppliers).toEqual([]);
    expect(catalog.costs.size).toBe(0);
  });

  it('6. so a value total is zero for staff and real for the manager', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const managerView = await materialsLib.loadCatalog();
    expect(materialsLib.inventoryValue(managerView.materials)).toBe(18 * 220);

    await auth.signOut();
    session.clearCurrentUser();

    await signInAs('staff@example.com', 'production_staff');
    const staffView = await materialsLib.loadCatalog();
    expect(materialsLib.inventoryValue(staffView.materials)).toBe(0);
  });

  it('leaves archived materials out of the catalog', async () => {
    await seed('materials/m2', {
      name: { stringValue: 'Retired Material' },
      category: { stringValue: 'wood' },
      unit: { stringValue: 'pcs' },
      stockQuantity: { integerValue: '4' },
      minThreshold: { integerValue: '0' },
      isArchived: { booleanValue: true },
      lastAuditId: { stringValue: 'seed' },
    });

    await signInAs('gm@example.com', 'general_manager');
    const catalog = await materialsLib.loadCatalog();

    expect(catalog.materials.map((m) => m.id)).toEqual(['m1']);
  });
});

// ============================================================
// CREATING MATERIALS
// ============================================================

describe('adding a material', () => {
  it('lets the manager set cost and supplier, written as a separate document', async () => {
    await signInAs('gm@example.com', 'general_manager');
    await seed('suppliers/s1', {
      name: { stringValue: 'Antipolo Hardwood Supply' },
      isArchived: { booleanValue: false },
      lastAuditId: { stringValue: 'seed' },
    });

    const id = await materialsLib.createMaterial({
      name: 'Kiln-Dried Narra Lumber',
      category: 'wood',
      size: '2x6x8ft',
      unit: 'pcs',
      stockQuantity: '150',
      minThreshold: '50',
      costPerUnit: '350',
      supplierId: 's1',
      supplierName: 'Antipolo Hardwood Supply',
      notes: 'Primary wood for cabinet frames',
    });

    const material = await waitForDoc(`materials/${id}`);
    expect(material.name.stringValue).toBe('Kiln-Dried Narra Lumber');
    expect(Number(material.minThreshold.integerValue)).toBe(50);
    expect(material.isArchived.booleanValue).toBe(false);

    // Cost lives in its own document, which is what lets staff be denied it
    const cost = await waitForDoc(`material_costs/${id}`);
    expect(Number(cost.costPerUnit.doubleValue ?? cost.costPerUnit.integerValue)).toBe(350);
    expect(cost.supplierName.stringValue).toBe('Antipolo Hardwood Supply');

    expect(await waitForAudit('material.create')).toBe(true);
  });

  it('lets staff add a material, with the threshold forced to zero', async () => {
    // Staff adding stock as it arrives is how the LAN system worked, and
    // that is kept. Setting reorder levels stays a manager decision.
    await signInAs('staff@example.com', 'production_staff');

    const id = await materialsLib.createMaterial({
      name: 'Contact Adhesive Gallon',
      category: 'adhesives',
      size: '1 gallon',
      unit: 'can',
      stockQuantity: '3',
      minThreshold: '25',
      costPerUnit: '540',
      supplierId: 's1',
      notes: '',
    });

    const material = await waitForDoc(`materials/${id}`);
    expect(material).not.toBeNull();
    expect(Number(material.minThreshold.integerValue)).toBe(0);

    // No cost document is created for a staff entry, even though the call
    // above supplied a cost and a supplier
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await fetchDoc(`material_costs/${id}`)).toBeNull();
  });
});

// ============================================================
// EDITING
// ============================================================

describe('editing a material', () => {
  beforeEach(async () => {
    await seed('materials/m1', {
      name: { stringValue: 'Mahogany Plank' },
      category: { stringValue: 'wood' },
      unit: { stringValue: 'pcs' },
      size: { stringValue: '1x4x8ft' },
      stockQuantity: { integerValue: '18' },
      minThreshold: { integerValue: '30' },
      notes: { stringValue: '' },
      isArchived: { booleanValue: false },
      lastAuditId: { stringValue: 'seed' },
    });
  });

  it('records only the fields that changed', async () => {
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

    expect(await waitForAudit('material.update')).toBe(true);

    const entries = await listCollection('audit_logs');
    const entry = entries.find((d) => d.fields?.action?.stringValue === 'material.update');

    // The threshold moved, so that is what the entry names, and nothing else
    const after = entry.fields.after.mapValue.fields;
    expect(Object.keys(after)).toEqual(['minThreshold']);
    expect(entry.fields.summary.stringValue).toContain('minimum threshold');
  });

  it('writes nothing at all when nothing changed', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const existing = (await materialsLib.loadCatalog()).materials[0];

    await materialsLib.updateMaterial('m1', existing, {
      name: 'Mahogany Plank',
      category: 'wood',
      size: '1x4x8ft',
      unit: 'pcs',
      minThreshold: '30',
      costPerUnit: '',
      supplierId: '',
      notes: '',
    });

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(await auditActions()).not.toContain('material.update');
  });

  it('files a cost change under material_cost.update, not material.update', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const existing = (await materialsLib.loadCatalog()).materials[0];

    await materialsLib.updateMaterial('m1', existing, {
      name: 'Mahogany Plank',
      category: 'wood',
      size: '1x4x8ft',
      unit: 'pcs',
      minThreshold: '30',
      costPerUnit: '240',
      supplierId: '',
      notes: '',
    });

    expect(await waitForAudit('material_cost.update')).toBe(true);
    // The material itself did not change, so no entry claims it did
    expect(await auditActions()).not.toContain('material.update');
  });

  it('archives rather than deletes, so history survives', async () => {
    await signInAs('gm@example.com', 'general_manager');
    const existing = (await materialsLib.loadCatalog()).materials[0];

    await materialsLib.archiveMaterial('m1', existing);

    expect(await waitForAudit('material.archive')).toBe(true);

    // The document is still there, just out of the catalog
    const material = await fetchDoc('materials/m1');
    expect(material).not.toBeNull();
    expect(material.isArchived.booleanValue).toBe(true);

    const catalog = await materialsLib.loadCatalog();
    expect(catalog.materials).toEqual([]);
  });
});

// ============================================================
// SUPPLIERS
// ============================================================

describe('suppliers', () => {
  it('can be added by the manager, which the LAN version could not do', async () => {
    await signInAs('gm@example.com', 'general_manager');

    const id = await materialsLib.createSupplier({
      name: 'Sierra Metalworks Trading',
      viberContact: '09193456789',
      notes: 'Steel tubing and adhesives, Antipolo City',
    });

    const supplier = await waitForDoc(`suppliers/${id}`);
    expect(supplier.name.stringValue).toBe('Sierra Metalworks Trading');
    expect(supplier.viberContact.stringValue).toBe('09193456789');
    expect(supplier.isArchived.booleanValue).toBe(false);

    expect(await waitForAudit('supplier.create')).toBe(true);
  });

  it('cannot be added by staff', async () => {
    await signInAs('staff@example.com', 'production_staff');

    // How the refusal arrives depends on the cache in use, and both are
    // real: with offline persistence the write resolves locally and is
    // rolled back when the server rejects it, while on a memory cache the
    // commit waits for the server and rejects outright. The test accepts
    // either and asserts the thing that actually matters, which is that no
    // supplier document is ever created.
    let createdId = null;
    try {
      createdId = await materialsLib.createSupplier({
        name: 'Should Not Exist',
        viberContact: '',
        notes: '',
      });
    } catch (error) {
      expect(String(error)).toMatch(/permission|insufficient/i);
    }

    await new Promise((resolve) => setTimeout(resolve, 800));

    if (createdId) expect(await fetchDoc(`suppliers/${createdId}`)).toBeNull();
    expect(await listCollection('suppliers')).toEqual([]);
  });
});
