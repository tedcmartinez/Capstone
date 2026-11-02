// Step 3 of the migration: write the plan to Firestore
//
// Follows tools/migrate/output/plan.json exactly, with the Firebase Admin
// SDK. A dry run unless --commit is given.
//
// Usage:
//   npm run migrate:import -- --target emulator               dry run
//   npm run migrate:import -- --target emulator --commit      rehearsal
//   npm run migrate:import -- --target live --key <file>      dry run
//   npm run migrate:import -- --target live --key <file> --commit --confirm cornerblock-inventory
//
// Options:
//   --target emulator|live  where to write. Required, so there is no default
//                           that could point at the real database by accident.
//   --commit                actually write. Without it nothing is written.
//   --confirm <project id>  required with --target live --commit, as a
//                           deliberate second step.
//   --key <file>            the service account key, for --target live. Must
//                           be outside this repository.
//   --force                 write even though the target already holds data.
//   --plan <file>           a plan other than output/plan.json.
//
// The Admin SDK is not subject to firestore.rules, which is why it can write
// the starting stock figures and the history as they were. Every document it
// writes still carries a lastAuditId pointing at a data.migrate entry, so the
// imported data meets the same rule as everything else in the system: no
// record exists without an audit entry explaining it.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { OUTPUT_DIR, DEFAULT_RECEIPTS_DIR } from './convert.mjs';
import { connect, parseArgs, PROJECT_ID } from './target.mjs';
import {
  APP_VERSION,
  RECEIPT_MAX_BYTES,
  RECEIPT_MAX_DIMENSION,
  RECEIPT_QUALITY_STEPS,
} from '../../app-firebase/src/lib/config.js';

// Who the audit trail says did it. There is no signed-in person behind an
// Admin SDK write, so the entries name the migration itself.
const ACTOR = {
  actorUid: 'system:migration',
  actorEmail: null,
  actorName: 'Data migration from the LAN version',
  actorRole: null,
};

// Firestore allows 500 writes in one batch. A little room is left.
const BATCH_LIMIT = 450;

// ============================================================
// RECEIPTS
//
// The same compression the browser applies to a new upload, with the same
// limits from config.js: at most 1280 pixels on the long side, JPEG, and the
// quality stepped down until the image fits 300 KB. An image that will not
// fit even then is left out and reported, exactly as the upload form would
// refuse it.
// ============================================================

// maxBytes exists only so the tests can reach the refusal. With the real
// limit it is practically never reached: resized to 1280 pixels, even an
// image of pure random noise, the worst case there is for JPEG, comes out
// at about 270 KB at the lowest quality step.
export async function compressReceiptFile(path, { maxBytes = RECEIPT_MAX_BYTES } = {}) {
  const original = readFileSync(path);

  for (const quality of RECEIPT_QUALITY_STEPS) {
    const output = await sharp(original)
      // Turns a phone photo the right way up, as a browser does when it
      // draws one onto a canvas
      .rotate()
      .resize({
        width: RECEIPT_MAX_DIMENSION,
        height: RECEIPT_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      // A transparent PNG would otherwise turn black as a JPEG
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: Math.round(quality * 100) })
      .toBuffer({ resolveWithObject: true });

    if (output.data.length <= maxBytes) {
      return {
        base64: output.data.toString('base64'),
        mimeType: 'image/jpeg',
        sizeBytes: output.data.length,
        originalBytes: original.length,
        width: output.info.width,
        height: output.info.height,
        quality,
      };
    }
  }

  return null;
}

// ============================================================
// THE IMPORT
// ============================================================

// db is an Admin SDK Firestore. Returns a report of what was, or would be,
// written. Exported so the tests can run it against the emulator.
export async function runImport({ db, FieldValue, Timestamp, plan, receiptsDir, commit, force, log = () => {} }) {
  const report = {
    committed: commit,
    suppliers: 0,
    materials: 0,
    materialCosts: 0,
    movements: 0,
    receipts: 0,
    auditEntries: 0,
    receiptsSkipped: [],
    receiptSizes: [],
  };

  // ---- Refuse to write over a database already in use ----
  //
  // Once the new system is in use, its quantities are the real ones. A
  // second import would put the LAN version's old figures back over them.
  for (const name of ['materials', 'suppliers', 'stock_movements']) {
    const existing = await db.collection(name).limit(1).get();
    if (!existing.empty && !force) {
      throw new Error(
        `The target already has documents in ${name}. Importing again would overwrite stock ` +
          'figures with the old ones from the LAN version. Use --force only if this is a ' +
          'rehearsal database you mean to overwrite.'
      );
    }
  }

  // ---- Compress the receipts first, so a failure stops before any write ----
  const receipts = new Map();
  for (const movement of plan.movements) {
    if (!movement.receiptFile) continue;

    const path = join(receiptsDir, movement.receiptFile);
    if (!existsSync(path)) {
      report.receiptsSkipped.push(`${movement.receiptFile}: file not found`);
      continue;
    }

    const compressed = await compressReceiptFile(path);
    if (!compressed) {
      report.receiptsSkipped.push(
        `${movement.receiptFile}: still over ${RECEIPT_MAX_BYTES / 1000} KB after compression`
      );
      continue;
    }

    receipts.set(movement.id, compressed);
    report.receiptSizes.push(
      `${movement.receiptFile}: ${Math.round(compressed.originalBytes / 1024)} KB to ` +
        `${Math.round(compressed.sizeBytes / 1024)} KB, ${compressed.width}x${compressed.height}`
    );
  }

  // ---- Batching ----
  let batch = db.batch();
  let pending = 0;

  async function flush() {
    if (pending === 0) return;
    if (commit) await batch.commit();
    batch = db.batch();
    pending = 0;
  }

  // Adds one group of documents that share an audit entry. A group is never
  // split across two batches, so a document and its entry always land
  // together.
  async function group(writes, entry) {
    if (pending + writes.length + 1 > BATCH_LIMIT) await flush();

    const auditRef = db.collection('audit_logs').doc();

    for (const { ref, data } of writes) {
      batch.set(ref, { ...data, lastAuditId: auditRef.id });
    }

    batch.set(auditRef, {
      action: 'data.migrate',
      entity: entry.entity,
      entityId: entry.entityId,
      materialId: entry.materialId ?? null,
      ...ACTOR,
      before: null,
      after: entry.after,
      summary: entry.summary,
      timestamp: FieldValue.serverTimestamp(),
      appVersion: APP_VERSION,
    });

    pending += writes.length + 1;
    report.auditEntries += 1;
  }

  const now = FieldValue.serverTimestamp();
  const stamp = { createdAt: now, createdBy: ACTOR.actorUid, updatedAt: now, updatedBy: ACTOR.actorUid };

  // ---- Suppliers, first, since material costs refer to them ----
  for (const supplier of plan.suppliers) {
    await group(
      [{ ref: db.collection('suppliers').doc(supplier.id), data: { ...supplier.data, legacyId: supplier.legacyId, ...stamp } }],
      {
        entity: 'suppliers',
        entityId: supplier.id,
        after: { name: supplier.data.name, legacyId: supplier.legacyId },
        summary: `Imported supplier ${supplier.data.name} from the LAN version (old id ${supplier.legacyId})`,
      }
    );
    report.suppliers += 1;
  }

  // ---- Materials, each with its cost record in the same entry ----
  for (const material of plan.materials) {
    const writes = [
      {
        ref: db.collection('materials').doc(material.id),
        data: { ...material.data, legacyId: material.legacyId, ...stamp },
      },
    ];

    if (material.cost) {
      writes.push({
        ref: db.collection('material_costs').doc(material.id),
        data: { ...material.cost, legacyId: material.legacyId },
      });
      report.materialCosts += 1;
    }

    await group(writes, {
      entity: 'materials',
      entityId: material.id,
      materialId: material.id,
      after: {
        name: material.data.name,
        stockQuantity: material.data.stockQuantity,
        minThreshold: material.data.minThreshold,
        ...(material.cost ? { costPerUnit: material.cost.costPerUnit, supplierName: material.cost.supplierName } : {}),
        legacyId: material.legacyId,
      },
      summary:
        `Imported ${material.data.name} from the LAN version with ${material.data.stockQuantity} ` +
        `${material.data.unit} on hand (old id ${material.legacyId})`,
    });
    report.materials += 1;
  }

  // ---- Movements, each with its receipt in the same entry ----
  for (const movement of plan.movements) {
    const createdAt = Timestamp.fromDate(new Date(movement.data.createdAt));
    const receipt = receipts.get(movement.id);
    const receiptRef = receipt ? db.collection('receipts').doc() : null;

    const writes = [
      {
        ref: db.collection('stock_movements').doc(movement.id),
        data: {
          ...movement.data,
          createdAt,
          receiptId: receiptRef ? receiptRef.id : null,
          legacyId: movement.legacyId,
        },
      },
    ];

    if (receiptRef) {
      writes.push({
        ref: receiptRef,
        data: {
          movementId: movement.id,
          mimeType: receipt.mimeType,
          dataBase64: receipt.base64,
          sizeBytes: receipt.sizeBytes,
          uploadedBy: null,
          legacyFile: movement.receiptFile,
          createdAt,
        },
      });
      report.receipts += 1;
    }

    await group(writes, {
      entity: 'stock_movements',
      entityId: movement.id,
      materialId: movement.data.materialId,
      after: {
        type: movement.data.type,
        quantity: movement.data.quantity,
        movementDate: movement.data.movementDate,
        legacyId: movement.legacyId,
        ...(receiptRef ? { receiptId: receiptRef.id } : {}),
      },
      summary:
        `Imported a stock ${movement.data.type} of ${movement.data.quantity}, ` +
        `${movement.data.materialName}, dated ${movement.data.movementDate} (old id ${movement.legacyId})`,
    });
    report.movements += 1;
  }

  // ---- One entry for the run as a whole ----
  await group([], {
    entity: 'migration',
    entityId: null,
    after: {
      suppliers: report.suppliers,
      materials: report.materials,
      materialCosts: report.materialCosts,
      movements: report.movements,
      receipts: report.receipts,
      warnings: plan.warnings.length,
    },
    summary:
      `Migrated the LAN version's data: ${report.suppliers} suppliers, ${report.materials} materials, ` +
      `${report.movements} stock movements and ${report.receipts} receipts`,
  });

  await flush();
  log(report);
  return report;
}

// ============================================================
// RUNNING IT
// ============================================================

async function main() {
  const args = parseArgs(process.argv.slice(2), ['target', 'commit', 'confirm', 'key', 'force', 'plan']);

  // A live write needs the project named a second time, so it cannot happen
  // by repeating a rehearsal command with only the target changed
  if (args.target === 'live' && args.commit && args.confirm !== PROJECT_ID) {
    throw new Error(`A live import needs --confirm ${PROJECT_ID} as well as --commit.`);
  }

  const { db, FieldValue, Timestamp, description } = await connect(args);
  console.log(`Target: ${description}`);

  const planPath = args.plan || join(OUTPUT_DIR, 'plan.json');
  if (!existsSync(planPath)) throw new Error(`No plan at ${planPath}. Run npm run migrate:convert first.`);
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));

  console.log(args.commit ? 'Mode: WRITING' : 'Mode: dry run, nothing will be written');
  console.log('');

  const report = await runImport({
    db,
    FieldValue,
    Timestamp,
    plan,
    receiptsDir: DEFAULT_RECEIPTS_DIR,
    commit: args.commit,
    force: args.force,
  });

  const verb = args.commit ? 'Written' : 'Would write';
  console.log(`${verb}:`);
  console.log(`  Suppliers        ${report.suppliers}`);
  console.log(`  Materials        ${report.materials}`);
  console.log(`  Cost records     ${report.materialCosts}`);
  console.log(`  Stock movements  ${report.movements}`);
  console.log(`  Receipts         ${report.receipts}`);
  console.log(`  Audit entries    ${report.auditEntries}`);
  for (const line of report.receiptSizes) console.log(`    ${line}`);
  if (report.receiptsSkipped.length > 0) {
    console.log('  Receipts left out:');
    for (const line of report.receiptsSkipped) console.log(`    ${line}`);
  }
  if (plan.warnings.length > 0) {
    console.log('');
    console.log(`The plan carries ${plan.warnings.length} warning(s); see the convert output.`);
  }
  if (!args.commit) {
    console.log('');
    console.log('Nothing was written. Add --commit to write.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
