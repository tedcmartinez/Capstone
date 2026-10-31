// Step 4 of the migration: check what was written
//
// Reads every imported document back and compares it with the plan, field
// by field. Run after a rehearsal against the emulator, and again after the
// real import. Nothing is written.
//
// Usage:
//   npm run migrate:verify -- --target emulator
//   npm run migrate:verify -- --target live --key <file>
//
// Checks that:
//   - every supplier, material, cost record and movement in the plan exists,
//     and holds exactly the values the plan says
//   - every one of them points at an audit entry that exists and is a
//     data.migrate entry, which is the rule the rest of the system lives by
//   - there are no imported documents the plan does not account for
//
// Exits with an error when anything fails, so it can gate the next step.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OUTPUT_DIR } from './convert.mjs';
import { connect, parseArgs } from './target.mjs';

// Compares the fields the plan sets, ignoring the ones the import adds
// itself, such as timestamps and lastAuditId
function differences(expected, actual) {
  const problems = [];
  for (const [field, value] of Object.entries(expected)) {
    // createdAt is an ISO string in the plan and a Timestamp once written
    if (field === 'createdAt') continue;
    // receiptId is chosen at import time
    if (field === 'receiptId') continue;

    const got = actual?.[field];
    if (JSON.stringify(got ?? null) !== JSON.stringify(value ?? null)) {
      problems.push(`${field}: expected ${JSON.stringify(value)}, found ${JSON.stringify(got)}`);
    }
  }
  return problems;
}

export async function runVerify({ db, plan }) {
  const failures = [];
  const auditIds = new Set();
  let checked = 0;

  async function check(collection, id, expected) {
    const snapshot = await db.collection(collection).doc(id).get();
    checked += 1;

    if (!snapshot.exists) {
      failures.push(`${collection}/${id} is missing`);
      return;
    }

    for (const problem of differences(expected, snapshot.data())) {
      failures.push(`${collection}/${id} ${problem}`);
    }

    const auditId = snapshot.get('lastAuditId');
    if (!auditId) failures.push(`${collection}/${id} has no lastAuditId`);
    else auditIds.add(auditId);
  }

  for (const supplier of plan.suppliers) {
    await check('suppliers', supplier.id, { ...supplier.data, legacyId: supplier.legacyId });
  }

  for (const material of plan.materials) {
    await check('materials', material.id, { ...material.data, legacyId: material.legacyId });
    if (material.cost) {
      await check('material_costs', material.id, { ...material.cost, legacyId: material.legacyId });
    }
  }

  for (const movement of plan.movements) {
    await check('stock_movements', movement.id, { ...movement.data, legacyId: movement.legacyId });
  }

  // Every audit entry pointed at must exist and be a migration entry
  for (const auditId of auditIds) {
    const entry = await db.collection('audit_logs').doc(auditId).get();
    if (!entry.exists) failures.push(`audit_logs/${auditId} is pointed at but does not exist`);
    else if (entry.get('action') !== 'data.migrate') {
      failures.push(`audit_logs/${auditId} is a ${entry.get('action')} entry, not data.migrate`);
    }
  }

  // Nothing imported that the plan does not know about
  const expectedCounts = {
    suppliers: plan.suppliers.length,
    materials: plan.materials.length,
    material_costs: plan.materials.filter((m) => m.cost).length,
    stock_movements: plan.movements.length,
  };

  for (const [collection, expected] of Object.entries(expectedCounts)) {
    const all = await db.collection(collection).get();
    const imported = all.docs.filter((d) => d.id.startsWith('legacy-')).length;
    if (imported !== expected) {
      failures.push(`${collection} holds ${imported} imported documents, the plan has ${expected}`);
    }
  }

  return { checked, auditEntries: auditIds.size, failures };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ['target', 'key', 'plan']);
  const { db, description } = await connect(args);

  const planPath = args.plan || join(OUTPUT_DIR, 'plan.json');
  if (!existsSync(planPath)) throw new Error(`No plan at ${planPath}. Run npm run migrate:convert first.`);
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));

  console.log(`Checking ${description} against the plan...`);
  const result = await runVerify({ db, plan });

  console.log(`  ${result.checked} documents checked, pointing at ${result.auditEntries} audit entries`);

  if (result.failures.length === 0) {
    console.log('  Everything matches the plan.');
    return;
  }

  console.log(`  ${result.failures.length} problem(s):`);
  for (const failure of result.failures) console.log(`    - ${failure}`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
