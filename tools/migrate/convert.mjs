// Step 2 of the migration: turn the dump into an import plan
//
// Reads the LAN version's tables and works out exactly what will be written
// to Firestore, without writing anything. The result is a plan file that can
// be read, checked and kept, and that the import step then follows to the
// letter. Splitting the work this way means the risky part, writing to the
// live database, is a mechanical step over something already inspected.
//
// Usage:
//   npm run migrate:convert
//
// Reads  tools/migrate/input/cornerblock_db.sql  (from npm run migrate:dump)
//        tools/migrate/input/users.tsv            (names only, optional)
// Writes tools/migrate/output/plan.json

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDump, parseUserNames } from './sql-dump.mjs';
import { allowedReasons } from '../../app-firebase/src/lib/reasons.js';

// ============================================================
// IDS
//
// Each imported document gets an id built from its old one, such as
// legacy-material-12, rather than a random one. A rehearsal against the
// emulator then produces the same ids as the real run, the plan can be
// compared against what was written, and anyone looking at a document can
// trace it back to the row it came from. legacyId carries the number too.
// ============================================================

export const supplierDocId = (legacyId) => `legacy-supplier-${legacyId}`;
export const materialDocId = (legacyId) => `legacy-material-${legacyId}`;
export const movementDocId = (legacyId) => `legacy-movement-${legacyId}`;

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
const integer = (value) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0);

// ============================================================
// SPLITTING THE OLD NOTES COLUMN
//
// The LAN version had nowhere to store a movement's reason or reference, so
// MovementController::buildNotes() joined them into the notes column:
//
//   "Purchase | Ref: PO-1042 | delivered late"
//   "Project Usage | Project: Sofa set | rush order"
//
// The new system keeps reason, reference and notes as three fields. This
// takes the old text apart again, using the same rules that put it together:
// a reason only counts if it is one the old form could have submitted for
// that type of movement, and a reference only if it carries the prefix the
// old form gave it. Anything else stays in the notes, so no text is lost.
// ============================================================

export function splitLegacyNotes(type, notes) {
  const result = { reason: '', reference: '', notes: '' };
  const raw = text(notes);
  if (!raw) return result;

  const parts = raw.split(' | ');
  const rest = [];
  const referencePrefix = type === 'in' ? 'Ref: ' : 'Project: ';

  parts.forEach((part, index) => {
    // The reason was always written first, so only the first part can be one
    if (index === 0 && allowedReasons(type).includes(part)) {
      result.reason = part;
      return;
    }

    if (!result.reference && part.startsWith(referencePrefix)) {
      result.reference = part.slice(referencePrefix.length).trim();
      return;
    }

    rest.push(part);
  });

  // Rejoined with the same separator, so a note that itself contained " | "
  // comes out exactly as it was typed
  result.notes = rest.join(' | ');
  return result;
}

// ============================================================
// RECONSTRUCTING BEFORE AND AFTER
//
// The LAN version recorded each movement's quantity but not the stock figure
// either side of it, which the new system keeps on every movement. They can
// be worked out exactly, by walking backwards from the material's current
// stock: the newest movement left the material at its current figure, so it
// started from that figure minus its own change, and so on back.
//
// Walking backwards rather than forwards is what makes this exact. Going
// forwards would need the opening stock, which the old system never stored
// as a movement: it was typed into the Add Material form. Going backwards,
// the opening stock simply falls out as the first movement's beforeQty.
//
// If the walk ever goes below zero, the old records do not add up, usually
// because a quantity was changed some other way. That is reported, not
// hidden, and the movement is still imported, since it did happen.
// ============================================================

export function reconstructQuantities(movements, currentStock) {
  const results = new Array(movements.length);
  const problems = [];

  let after = integer(currentStock);

  for (let i = movements.length - 1; i >= 0; i -= 1) {
    const movement = movements[i];
    const quantity = integer(movement.quantity);
    const before = movement.type === 'in' ? after - quantity : after + quantity;

    if (before < 0) {
      problems.push(movement);
    }

    results[i] = { beforeQty: before, afterQty: after };
    after = before;
  }

  return { results, problems, openingStock: after };
}

// The order the LAN version listed movements in: by date, and by id within
// a day, since the id was the order they were entered in
function chronological(a, b) {
  if (a.movement_date < b.movement_date) return -1;
  if (a.movement_date > b.movement_date) return 1;
  return integer(a.movement_id) - integer(b.movement_id);
}

// A movement has no time of day in the old system, only a date. It is given
// one, in the order it was entered, so the new history lists same-day
// movements in the order they actually happened. Philippine time, since
// that is the shop's.
function createdAtFor(movementDate, orderInDay) {
  const base = new Date(`${movementDate}T08:00:00+08:00`);
  return new Date(base.getTime() + orderInDay * 1000).toISOString();
}

// ============================================================
// BUILDING THE PLAN
// ============================================================

// tables:    what parseDump() returned
// userNames: a Map of old user id to name, or an empty Map
// receiptFiles: the file names found in the old receipts folder
export function buildPlan({ tables, userNames = new Map(), receiptFiles = [] }) {
  const warnings = [];

  const supplierRows = tables.suppliers?.rows || [];
  const materialRows = tables.materials?.rows || [];
  const movementRows = tables.stock_movements?.rows || [];

  // ---- Suppliers ----
  const suppliers = supplierRows.map((row) => ({
    id: supplierDocId(row.supplier_id),
    legacyId: integer(row.supplier_id),
    data: {
      name: text(row.name),
      viberContact: text(row.viber_contact),
      notes: text(row.notes),
      isArchived: false,
    },
  }));

  const supplierById = new Map(suppliers.map((s) => [s.legacyId, s]));

  // ---- Materials, with cost and supplier split into a document of their own ----
  //
  // The new system keeps cost and supplier in material_costs, because
  // Firestore cannot hide one field of a document from production staff. So
  // one row of the old materials table becomes two documents.
  const materials = materialRows.map((row) => {
    const legacyId = integer(row.material_id);

    let cost = null;
    const hasCost = row.cost_per_unit !== null && row.cost_per_unit !== undefined;
    const hasSupplier = row.supplier_id !== null && row.supplier_id !== undefined;

    if (hasCost || hasSupplier) {
      const supplier = hasSupplier ? supplierById.get(integer(row.supplier_id)) : null;

      if (hasSupplier && !supplier) {
        warnings.push(
          `Material ${legacyId} (${text(row.name)}) names supplier ${row.supplier_id}, which does ` +
            'not exist in the dump. It is imported with no supplier.'
        );
      }

      cost = {
        costPerUnit: hasCost ? Number(row.cost_per_unit) : null,
        supplierId: supplier ? supplier.id : null,
        supplierName: supplier ? supplier.data.name : null,
      };
    }

    return {
      id: materialDocId(legacyId),
      legacyId,
      data: {
        name: text(row.name),
        category: text(row.category),
        size: text(row.size),
        unit: text(row.unit),
        stockQuantity: integer(row.stock_quantity),
        minThreshold: integer(row.min_threshold),
        notes: text(row.notes),
        isArchived: false,
      },
      cost,
    };
  });

  const materialById = new Map(materials.map((m) => [m.legacyId, m]));

  // ---- Movements ----
  const byMaterial = new Map();
  for (const row of movementRows) {
    const materialId = integer(row.material_id);

    if (!materialById.has(materialId)) {
      // The old foreign key deleted a material's movements with it, so this
      // only happens with a damaged dump. Nothing to attach it to.
      warnings.push(
        `Movement ${row.movement_id} belongs to material ${materialId}, which is not in the ` +
          'dump. It is left out.'
      );
      continue;
    }

    if (!byMaterial.has(materialId)) byMaterial.set(materialId, []);
    byMaterial.get(materialId).push(row);
  }

  // Each movement's time of day, worked out in one pass across every
  // material in the order the movements were entered. Counting per material
  // instead would put two same-day movements on different materials in an
  // order that has nothing to do with when they happened.
  const createdAtByLegacyId = new Map();
  const dayCounters = new Map();
  for (const row of [...movementRows].sort(chronological)) {
    const day = String(row.movement_date);
    const order = dayCounters.get(day) || 0;
    dayCounters.set(day, order + 1);
    createdAtByLegacyId.set(integer(row.movement_id), createdAtFor(day, order));
  }

  const movements = [];
  const receiptsWanted = new Set();

  for (const [materialId, rows] of byMaterial) {
    rows.sort(chronological);

    const material = materialById.get(materialId);
    const { results, problems, openingStock } = reconstructQuantities(rows, material.data.stockQuantity);

    if (problems.length > 0) {
      warnings.push(
        `The recorded movements of material ${materialId} (${material.data.name}) do not add up ` +
          `to its current stock of ${material.data.stockQuantity}: working backwards, the stock ` +
          `would have been ${openingStock} before the first movement. The movements are ` +
          'imported as recorded. Check this material with an adjustment after the migration.'
      );
    }

    rows.forEach((row, index) => {
      const type = row.type === 'in' ? 'in' : 'out';
      const split = splitLegacyNotes(type, row.notes);
      const loggedById = integer(row.logged_by);

      const day = String(row.movement_date);

      const receiptFile = text(row.receipt_file) || null;
      if (receiptFile) receiptsWanted.add(receiptFile);

      movements.push({
        id: movementDocId(row.movement_id),
        legacyId: integer(row.movement_id),
        materialLegacyId: materialId,
        receiptFile: type === 'in' ? receiptFile : null,
        data: {
          materialId: material.id,
          materialName: material.data.name,
          type,
          quantity: integer(row.quantity),
          beforeQty: results[index].beforeQty,
          afterQty: results[index].afterQty,
          movementDate: day,
          reason: split.reason,
          reference: split.reference,
          notes: split.notes,
          receiptId: null,
          // The person who logged it is not migrated, since nobody's account
          // is: everyone registers again. The name is kept, which is what the
          // history shows, and the old id with it.
          loggedBy: null,
          loggedByName: userNames.get(loggedById) || `LAN user #${loggedById}`,
          legacyLoggedById: loggedById,
          createdAt: createdAtByLegacyId.get(integer(row.movement_id)),
          // Tells the history page these before and after figures were worked
          // out from the old records, not typed on a screen
          source: 'lan-migration',
        },
      });
    });
  }

  // Oldest first, the order they are written in
  movements.sort((a, b) => (a.data.createdAt < b.data.createdAt ? -1 : 1));

  // ---- Receipts ----
  const available = new Set(receiptFiles);

  for (const movement of movements) {
    if (movement.receiptFile && !available.has(movement.receiptFile)) {
      warnings.push(
        `Movement ${movement.legacyId} lists receipt ${movement.receiptFile}, which is not in the ` +
          'receipts folder. The movement is imported without it.'
      );
      movement.receiptFile = null;
    }
  }

  // Images in the folder that no movement refers to have nothing to be
  // attached to, so they are listed rather than imported
  const orphanReceipts = receiptFiles.filter((file) => !receiptsWanted.has(file)).sort();

  if (userNames.size === 0 && movementRows.length > 0) {
    warnings.push(
      'No user names were supplied, so movements will show "LAN user #n" as who logged them. ' +
        'Run npm run migrate:dump to export the names.'
    );
  }

  return {
    summary: {
      suppliers: suppliers.length,
      materials: materials.length,
      materialCosts: materials.filter((m) => m.cost).length,
      movements: movements.length,
      receipts: movements.filter((m) => m.receiptFile).length,
      orphanReceipts: orphanReceipts.length,
      warnings: warnings.length,
    },
    suppliers,
    materials,
    movements,
    orphanReceipts,
    warnings,
  };
}

// ============================================================
// RUNNING IT
// ============================================================

const here = dirname(fileURLToPath(import.meta.url));
export const INPUT_DIR = join(here, 'input');
export const OUTPUT_DIR = join(here, 'output');
export const DEFAULT_RECEIPTS_DIR = resolve(here, '../../legacy-php/public/uploads/receipts');

function listReceiptFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
}

function main() {
  const dumpPath = join(INPUT_DIR, 'cornerblock_db.sql');
  const usersPath = join(INPUT_DIR, 'users.tsv');

  if (!existsSync(dumpPath)) {
    console.error(`No dump found at ${dumpPath}. Run npm run migrate:dump first.`);
    process.exit(1);
  }

  const tables = parseDump(readFileSync(dumpPath, 'utf8'));
  const userNames = existsSync(usersPath) ? parseUserNames(readFileSync(usersPath, 'utf8')) : new Map();
  const receiptFiles = listReceiptFiles(DEFAULT_RECEIPTS_DIR);

  const plan = buildPlan({ tables, userNames, receiptFiles });
  plan.generatedAt = new Date().toISOString();

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const planPath = join(OUTPUT_DIR, 'plan.json');
  writeFileSync(planPath, JSON.stringify(plan, null, 2));

  console.log('Plan written to', planPath);
  console.log('');
  console.log(`  Suppliers        ${plan.summary.suppliers}`);
  console.log(`  Materials        ${plan.summary.materials}`);
  console.log(`  Cost records     ${plan.summary.materialCosts}`);
  console.log(`  Stock movements  ${plan.summary.movements}`);
  console.log(`  Receipts         ${plan.summary.receipts}`);
  if (plan.orphanReceipts.length > 0) {
    console.log(`  Not imported     ${plan.orphanReceipts.length} receipt image(s) no movement refers to:`);
    for (const file of plan.orphanReceipts) console.log(`                     ${file}`);
  }
  console.log('');

  if (plan.warnings.length === 0) {
    console.log('No warnings.');
  } else {
    console.log(`${plan.warnings.length} warning(s):`);
    for (const warning of plan.warnings) console.log(`  - ${warning}`);
  }

  console.log('');
  console.log('Next: npm run migrate:import -- --target emulator   (a dry run, writes nothing)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
