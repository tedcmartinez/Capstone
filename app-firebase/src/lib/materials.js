// Materials, costs and suppliers: data access
//
// Replaces app/models/Material.php and Supplier.php. The PHP model built SQL
// with WHERE and ORDER BY clauses; here the whole catalog is read once and
// filtered in the browser.
//
// That is a deliberate choice, not laziness. A furniture shop tracks tens of
// materials, not thousands, so one query answers every filter, sort and
// search instantly, and Firestore charges per document read: filtering
// server-side would mean a fresh billed query on every keystroke of the
// search box. It is also what makes the catalog work offline, since the
// cached copy can be filtered without a connection.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { auditedWrite, diffFields, newDocId } from './audit.js';
import { currentUser, isManager } from './session.js';
import { stockStatus, peso } from './dom.js';

// ============================================================
// READING
// ============================================================

// Every material still in the catalog. Archived ones are left out, which is
// how "delete" works now: nothing is ever removed, so movement history always
// has a material to point at.
export async function loadMaterials() {
  const snapshot = await getDocs(
    query(collection(db, 'materials'), where('isArchived', '==', false), orderBy('name'))
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Cost and supplier for each material, keyed by material id.
//
// Returns an empty map for production staff rather than attempting the read.
// The rules would refuse it, and asking anyway would fill the browser console
// with permission errors on a page that is working exactly as intended.
export async function loadCosts() {
  if (!isManager()) return new Map();

  const snapshot = await getDocs(collection(db, 'material_costs'));
  return new Map(snapshot.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
}

export async function loadSuppliers() {
  if (!isManager()) return [];

  const snapshot = await getDocs(
    query(collection(db, 'suppliers'), where('isArchived', '==', false), orderBy('name'))
  );
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Loads everything the catalog page needs in one go, and joins the cost
// record onto each material. For staff the cost fields are simply absent,
// which is what keeps them off the screen.
export async function loadCatalog() {
  const [materials, costs, suppliers] = await Promise.all([
    loadMaterials(),
    loadCosts(),
    loadSuppliers(),
  ]);

  const joined = materials.map((material) => {
    const cost = costs.get(material.id);
    return {
      ...material,
      costPerUnit: cost?.costPerUnit ?? null,
      supplierId: cost?.supplierId ?? null,
      supplierName: cost?.supplierName ?? null,
    };
  });

  return { materials: joined, suppliers, costs };
}

// The distinct categories in use, for the filter dropdown and the datalist
// on the add and edit forms. Ported from Material::getCategories(), which
// ran SELECT DISTINCT category.
export function categoriesOf(materials) {
  return [...new Set(materials.map((m) => m.category).filter(Boolean))].sort();
}

// Everything at or below its threshold, worst first. Used by the alert bell,
// the dashboard, the low stock report and the reorder checklist, so the rule
// lives in one place exactly as Material::getLowStock() did.
export function lowStockOf(materials) {
  return materials
    .filter((m) => Number(m.stockQuantity) <= Number(m.minThreshold))
    .sort((a, b) => Number(a.stockQuantity) - Number(b.stockQuantity));
}

// ============================================================
// FILTERING, SORTING AND SEARCH
// Ported from Material::getFiltered() and its sortColumn() helper.
// ============================================================

export function filterMaterials(materials, options = {}) {
  const keyword = (options.keyword || '').trim().toLowerCase();
  const category = options.category || '';
  const status = options.status || '';
  const supplierId = options.supplierId || '';

  let rows = materials.filter((material) => {
    // The PHP version matched the keyword against name or category
    if (keyword) {
      const haystack = `${material.name || ''} ${material.category || ''}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }

    if (category && material.category !== category) return false;
    if (supplierId && material.supplierId !== supplierId) return false;

    if (status) {
      if (stockStatus(material.stockQuantity, material.minThreshold) !== status) return false;
    }

    return true;
  });

  return sortMaterials(rows, options.sort || 'name', options.direction || 'asc');
}

export function sortMaterials(materials, sort, direction) {
  // Which value each sort key reads. An unknown key falls back to the name,
  // the same safeguard sortColumn() provided against a tampered URL.
  const keys = {
    name: (m) => (m.name || '').toLowerCase(),
    category: (m) => (m.category || '').toLowerCase(),
    stock: (m) => Number(m.stockQuantity) || 0,
    cost: (m) => Number(m.costPerUnit) || 0,
    supplier: (m) => (m.supplierName || '').toLowerCase(),
  };
  const read = keys[sort] || keys.name;

  const sorted = [...materials].sort((a, b) => {
    const left = read(a);
    const right = read(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });

  return direction === 'desc' ? sorted.reverse() : sorted;
}

// ============================================================
// VALIDATION
// Ported from MaterialController::validate(). The rules enforce the parts
// that matter for security; this is here to give a readable message rather
// than a permission error.
// ============================================================

export function validateMaterial(input, { isCreate }) {
  const errors = [];

  if (!input.name?.trim()) errors.push('Material name is required.');
  if (!input.category?.trim()) errors.push('Category is required.');
  if (!input.unit?.trim()) errors.push('Unit is required.');

  if (isCreate) {
    if (!isWholeNumber(input.stockQuantity) || Number(input.stockQuantity) < 0) {
      errors.push('Opening stock quantity must be a whole number that is zero or more.');
    }
  }

  // Threshold, cost and supplier are manager fields. Staff never submit them,
  // and the rules refuse them if they try.
  if (isManager()) {
    if (!isWholeNumber(input.minThreshold) || Number(input.minThreshold) < 0) {
      errors.push('Minimum threshold must be a whole number that is zero or more.');
    }
    if (input.costPerUnit !== '' && input.costPerUnit !== null && Number.isNaN(Number(input.costPerUnit))) {
      errors.push('Cost per unit must be a valid number.');
    }
  }

  return errors;
}

function isWholeNumber(value) {
  return value !== '' && value !== null && value !== undefined && /^\d+$/.test(String(value).trim());
}

// ============================================================
// WRITING
//
// Cost and supplier live in material_costs, so saving a material can touch
// two documents. Both carry the same lastAuditId and are committed in one
// batch, which satisfies the rules for both and keeps the pair consistent:
// there is no state where a material exists with a cost record that has no
// audit entry.
// ============================================================

export async function createMaterial(input) {
  const user = currentUser();
  const id = newDocId('materials');

  const material = {
    name: input.name.trim(),
    category: input.category.trim(),
    size: input.size?.trim() || '',
    unit: input.unit.trim(),
    stockQuantity: Number(input.stockQuantity),
    // Staff must leave the threshold at zero. The rules insist on it, so the
    // same default is applied here rather than letting the write be refused.
    minThreshold: isManager() ? Number(input.minThreshold) : 0,
    notes: input.notes?.trim() || '',
    isArchived: false,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  };

  const ops = [{ type: 'set', collection: 'materials', id, data: material }];

  // The cost record is only written when there is something to record, so a
  // material added by staff simply has no cost document at all.
  const cost = costRecordFrom(input);
  if (isManager() && cost) {
    ops.push({ type: 'set', collection: 'material_costs', id, data: cost });
  }

  await auditedWrite(ops, {
    action: 'material.create',
    entity: 'materials',
    entityId: id,
    materialId: id,
    after: {
      name: material.name,
      category: material.category,
      unit: material.unit,
      stockQuantity: material.stockQuantity,
      minThreshold: material.minThreshold,
      ...(cost ? { costPerUnit: cost.costPerUnit, supplierName: cost.supplierName } : {}),
    },
    summary: `Added ${material.name} with an opening stock of ${material.stockQuantity} ${material.unit}`,
  });

  return id;
}

// Updating is split into two audited writes, one per document, so the audit
// trail names material.update and material_cost.update separately and each
// entry's diff shows only its own fields. A change to just the cost does not
// produce an entry claiming the material was edited.
export async function updateMaterial(id, existing, input) {
  const user = currentUser();

  const catalogFields = ['name', 'category', 'size', 'unit', 'minThreshold', 'notes'];
  const proposed = {
    name: input.name.trim(),
    category: input.category.trim(),
    size: input.size?.trim() || '',
    unit: input.unit.trim(),
    minThreshold: Number(input.minThreshold),
    notes: input.notes?.trim() || '',
  };

  const catalogDiff = diffFields(existing, proposed, catalogFields);

  if (catalogDiff.hasChanges) {
    await auditedWrite(
      [
        {
          type: 'update',
          collection: 'materials',
          id,
          data: { ...proposed, updatedAt: serverTimestamp(), updatedBy: user.uid },
        },
      ],
      {
        action: 'material.update',
        entity: 'materials',
        entityId: id,
        materialId: id,
        before: catalogDiff.before,
        after: catalogDiff.after,
        summary: `Edited ${proposed.name} (${describeChanges(catalogDiff.after)})`,
      }
    );
  }

  // Cost and supplier, manager only
  if (isManager()) {
    const cost = costRecordFrom(input) || { costPerUnit: null, supplierId: null, supplierName: null };
    const costDiff = diffFields(existing, cost, ['costPerUnit', 'supplierId', 'supplierName']);

    if (costDiff.hasChanges) {
      await auditedWrite(
        [{ type: 'merge', collection: 'material_costs', id, data: cost }],
        {
          action: 'material_cost.update',
          entity: 'material_costs',
          entityId: id,
          materialId: id,
          before: costDiff.before,
          after: costDiff.after,
          summary:
            `Updated cost details for ${proposed.name}: ` +
            `${peso(cost.costPerUnit)} per ${proposed.unit}` +
            (cost.supplierName ? `, supplied by ${cost.supplierName}` : ''),
        }
      );
    }
  }
}

// "Delete" in the interface. The record stays, so movement history, reports
// and the audit trail all keep working, and an archive can be reversed.
export async function archiveMaterial(id, material) {
  const user = currentUser();

  await auditedWrite(
    [
      {
        type: 'update',
        collection: 'materials',
        id,
        data: { isArchived: true, updatedAt: serverTimestamp(), updatedBy: user.uid },
      },
    ],
    {
      action: 'material.archive',
      entity: 'materials',
      entityId: id,
      materialId: id,
      before: { isArchived: false },
      after: { isArchived: true },
      summary:
        `Archived ${material.name}, which had ${Number(material.stockQuantity)} ` +
        `${material.unit} on hand. Its movement history is kept.`,
    }
  );
}

// Builds the cost document from form input, or null when the manager left
// both fields empty, so an empty cost record is never created.
function costRecordFrom(input) {
  const hasCost = input.costPerUnit !== '' && input.costPerUnit !== null && input.costPerUnit !== undefined;
  const hasSupplier = Boolean(input.supplierId);

  if (!hasCost && !hasSupplier) return null;

  return {
    costPerUnit: hasCost ? Number(input.costPerUnit) : null,
    supplierId: hasSupplier ? input.supplierId : null,
    supplierName: hasSupplier ? input.supplierName || null : null,
  };
}

// Turns a diff into readable text for the audit summary, for example
// "name, minThreshold" becomes "name and minimum threshold".
function describeChanges(after) {
  const labels = {
    name: 'name',
    category: 'category',
    size: 'size',
    unit: 'unit',
    minThreshold: 'minimum threshold',
    notes: 'notes',
    costPerUnit: 'cost per unit',
    supplierId: 'supplier',
    supplierName: 'supplier',
  };
  const names = [...new Set(Object.keys(after || {}).map((key) => labels[key] || key))];

  if (names.length === 0) return 'no fields';
  if (names.length === 1) return `changed the ${names[0]}`;
  return `changed the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ============================================================
// SUPPLIERS
//
// The LAN version had no way to add a supplier: its own empty state said
// they were "added directly to the database". That worked when the manager
// could open phpMyAdmin on the office PC, but there is no such door into
// Firestore, so the manager needs to manage suppliers from the app itself.
// ============================================================

export async function createSupplier(input) {
  const user = currentUser();
  const id = newDocId('suppliers');

  const supplier = {
    name: input.name.trim(),
    viberContact: input.viberContact?.trim() || '',
    notes: input.notes?.trim() || '',
    isArchived: false,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  };

  await auditedWrite([{ type: 'set', collection: 'suppliers', id, data: supplier }], {
    action: 'supplier.create',
    entity: 'suppliers',
    entityId: id,
    after: { name: supplier.name, viberContact: supplier.viberContact },
    summary: `Added supplier ${supplier.name}`,
  });

  return id;
}

export async function updateSupplier(id, existing, input) {
  const user = currentUser();

  const proposed = {
    name: input.name.trim(),
    viberContact: input.viberContact?.trim() || '',
    notes: input.notes?.trim() || '',
  };

  const changes = diffFields(existing, proposed, ['name', 'viberContact', 'notes']);
  if (!changes.hasChanges) return;

  await auditedWrite(
    [
      {
        type: 'update',
        collection: 'suppliers',
        id,
        data: { ...proposed, updatedAt: serverTimestamp(), updatedBy: user.uid },
      },
    ],
    {
      action: 'supplier.update',
      entity: 'suppliers',
      entityId: id,
      before: changes.before,
      after: changes.after,
      summary: `Edited supplier ${proposed.name} (${describeChanges(changes.after)})`,
    }
  );
}

export async function archiveSupplier(id, supplier) {
  const user = currentUser();

  await auditedWrite(
    [
      {
        type: 'update',
        collection: 'suppliers',
        id,
        data: { isArchived: true, updatedAt: serverTimestamp(), updatedBy: user.uid },
      },
    ],
    {
      action: 'supplier.archive',
      entity: 'suppliers',
      entityId: id,
      before: { isArchived: false },
      after: { isArchived: true },
      summary: `Archived supplier ${supplier.name}`,
    }
  );
}

// ============================================================
// GROUPED SUMMARIES
// Ported from getCategoryStats() and getSupplierStats(), which did the same
// work with GROUP BY. Totals that involve money come out as null for staff,
// because they have no cost data to add up.
// ============================================================

export function categoryStats(materials) {
  const groups = new Map();

  for (const material of materials) {
    const key = material.category || '(uncategorised)';
    if (!groups.has(key)) {
      groups.set(key, {
        category: key,
        itemCount: 0,
        totalStock: 0,
        totalValue: 0,
        outCount: 0,
        lowCount: 0,
      });
    }

    const group = groups.get(key);
    const quantity = Number(material.stockQuantity) || 0;
    const status = stockStatus(quantity, material.minThreshold);

    group.itemCount += 1;
    group.totalStock += quantity;
    group.totalValue += quantity * (Number(material.costPerUnit) || 0);
    if (status === 'out') group.outCount += 1;
    if (status === 'low') group.lowCount += 1;
  }

  return [...groups.values()].sort((a, b) => a.category.localeCompare(b.category));
}

// One row per supplier, including suppliers with no materials yet, which the
// SQL version achieved with a LEFT JOIN.
export function supplierStats(suppliers, materials) {
  return suppliers
    .map((supplier) => {
      const supplied = materials.filter((m) => m.supplierId === supplier.id);

      return {
        ...supplier,
        itemCount: supplied.length,
        totalValue: supplied.reduce(
          (total, m) => total + (Number(m.stockQuantity) || 0) * (Number(m.costPerUnit) || 0),
          0
        ),
        reorderCount: supplied.filter(
          (m) => Number(m.stockQuantity) <= Number(m.minThreshold)
        ).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Total value of everything on hand, ported from inventoryValue(). Materials
// with no recorded cost add nothing, exactly as the SQL COALESCE did.
export function inventoryValue(materials) {
  return materials.reduce(
    (total, m) => total + (Number(m.stockQuantity) || 0) * (Number(m.costPerUnit) || 0),
    0
  );
}

// Reads one material plus its cost record, used when a page needs a single
// row rather than the whole catalog.
export async function findMaterial(id) {
  const snapshot = await getDoc(doc(db, 'materials', id));
  if (!snapshot.exists()) return null;

  const material = { id: snapshot.id, ...snapshot.data() };

  if (isManager()) {
    const costSnapshot = await getDoc(doc(db, 'material_costs', id));
    if (costSnapshot.exists()) Object.assign(material, costSnapshot.data());
  }

  return material;
}
