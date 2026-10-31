// Shared setup for the security rules tests
//
// Every test here runs against the Firestore emulator with the real
// firestore.rules file loaded, so what passes in these tests is exactly what
// the deployed rules will allow. Nothing touches the live project.

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

import { WEBMASTER_EMAIL } from '../../app-firebase/src/lib/config.js';

// A counter so each generated audit log id is unique within a test run.
// The rules reject a reused id, which is the behaviour test 10 checks.
let auditCounter = 0;

export function nextAuditId() {
  auditCounter += 1;
  return `audit_test_${Date.now()}_${auditCounter}`;
}

export async function setupTestEnv() {
  return initializeTestEnvironment({
    projectId: 'cornerblock-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

// ============================================================
// SIGNED-IN CONTEXTS
//
// The second argument to authenticatedContext becomes the auth token, which
// is what the rules read for request.auth.token.email and email_verified.
// ============================================================

export function asUser(env, uid, email, emailVerified = true) {
  return env
    .authenticatedContext(uid, { email, email_verified: emailVerified })
    .firestore();
}

export function asWebmaster(env, emailVerified = true) {
  return asUser(env, 'uid_webmaster', WEBMASTER_EMAIL, emailVerified);
}

export function asSignedOut(env) {
  return env.unauthenticatedContext().firestore();
}

// ============================================================
// SEEDING
//
// withSecurityRulesDisabled is the only way to create the starting state,
// since the rules themselves would reject documents without audit entries.
// This is test setup standing in for data that already exists in the
// database, not a bypass the application has access to.
// ============================================================

export async function seedUser(env, uid, fields) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      name: 'Seeded User',
      email: `${uid}@example.com`,
      role: 'production_staff',
      status: 'active',
      emailVerified: true,
      provider: 'password',
      createdAt: new Date(),
      lastAuditId: 'seed',
      ...fields,
    });
  });
}

export async function seedDoc(env, collection, id, fields) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), collection, id), {
      lastAuditId: 'seed',
      ...fields,
    });
  });
}

// Convenience wrappers for the three roles the tests use most
export const seedActiveStaff = (env, uid) =>
  seedUser(env, uid, { role: 'production_staff', status: 'active' });

export const seedPendingStaff = (env, uid) =>
  seedUser(env, uid, { role: 'production_staff', status: 'pending' });

export const seedActiveGM = (env, uid) =>
  seedUser(env, uid, { role: 'general_manager', status: 'active' });

// ============================================================
// AUDITED WRITES
//
// The rules require every data write to arrive with a new audit log entry in
// the same batch. These helpers build that batch so the tests exercise the
// same shape of write the real application performs.
// ============================================================

export function auditEntry(actorUid, overrides = {}) {
  return {
    action: 'test.write',
    entity: 'test',
    entityId: 'test-entity',
    actorUid,
    actorEmail: `${actorUid}@example.com`,
    actorName: 'Test Actor',
    actorRole: 'production_staff',
    summary: 'Test write performed by the rules test suite',
    timestamp: serverTimestamp(),
    appVersion: '2.0.0',
    ...overrides,
  };
}

// One data document plus its audit log, committed together.
// Pass an explicit auditId to simulate reusing an existing one.
export function auditedSet(db, actorUid, path, data, options = {}) {
  const auditId = options.auditId || nextAuditId();
  const batch = writeBatch(db);

  batch.set(doc(db, path[0], path[1]), { ...data, lastAuditId: auditId });

  if (options.skipLog !== true) {
    batch.set(
      doc(db, 'audit_logs', auditId),
      auditEntry(actorUid, options.auditOverrides)
    );
  }

  return batch.commit();
}

// Same as auditedSet but merges into an existing document, which is what an
// update does in the application.
export function auditedUpdate(db, actorUid, path, data, options = {}) {
  const auditId = options.auditId || nextAuditId();
  const batch = writeBatch(db);

  batch.update(doc(db, path[0], path[1]), { ...data, lastAuditId: auditId });

  if (options.skipLog !== true) {
    batch.set(
      doc(db, 'audit_logs', auditId),
      auditEntry(actorUid, options.auditOverrides)
    );
  }

  return batch.commit();
}
