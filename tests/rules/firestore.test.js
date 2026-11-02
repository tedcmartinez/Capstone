// Security rules tests
//
// These cover the numbered acceptance tests in the migration brief that can
// be proved against the rules themselves (1 to 12). The remaining ones are
// about email rendering, exports, and the installed app, so they stay on the
// manual checklist in the README.
//
// Run with:  npm run test:rules

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';

import { WEBMASTER_EMAIL } from '../../app-firebase/src/lib/config.js';
import {
  setupTestEnv,
  asUser,
  asWebmaster,
  asSignedOut,
  seedUser,
  seedDoc,
  seedActiveStaff,
  seedActiveGM,
  seedPendingStaff,
  auditEntry,
  auditedSet,
  auditedUpdate,
  nextAuditId,
} from './helpers.js';

let env;

beforeAll(async () => {
  env = await setupTestEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

// ============================================================
// 1 and 2. SELF-REGISTRATION LANDS AS PENDING STAFF
// ============================================================

describe('registration', () => {
  it('1. email/password sign-up may only create itself as pending staff', async () => {
    const db = asUser(env, 'uid_new', 'newhire@example.com', true);

    await assertSucceeds(
      auditedSet(db, 'uid_new', ['users', 'uid_new'], {
        name: 'New Hire',
        email: 'newhire@example.com',
        provider: 'password',
        role: 'production_staff',
        status: 'pending',
        emailVerified: false,
      })
    );
  });

  it('1. a pending user cannot read materials', async () => {
    await seedPendingStaff(env, 'uid_pending');
    await seedDoc(env, 'materials', 'mat_1', { name: 'Mahogany Plank' });

    const db = asUser(env, 'uid_pending', 'pending@example.com');

    await assertFails(getDoc(doc(db, 'materials', 'mat_1')));
    await assertFails(getDocs(collection(db, 'materials')));
  });

  it('1. a pending user can read their own account and nothing else', async () => {
    await seedPendingStaff(env, 'uid_pending');
    await seedPendingStaff(env, 'uid_other');
    for (const [collectionName, id] of [
      ['materials', 'mat_1'],
      ['material_costs', 'mat_1'],
      ['suppliers', 'sup_1'],
      ['categories', 'cat_1'],
      ['stock_movements', 'mov_1'],
      ['receipts', 'rec_1'],
      ['audit_logs', 'log_1'],
      ['notification_log', 'note_1'],
    ]) {
      await seedDoc(env, collectionName, id, { name: 'seeded' });
    }

    const db = asUser(env, 'uid_pending', 'pending@example.com');

    // The one read the waiting screen makes, and keeps listening to
    await assertSucceeds(getDoc(doc(db, 'users', 'uid_pending')));

    await assertFails(getDoc(doc(db, 'users', 'uid_other')));
    await assertFails(getDocs(collection(db, 'users')));
    await assertFails(getDoc(doc(db, 'materials', 'mat_1')));
    await assertFails(getDoc(doc(db, 'material_costs', 'mat_1')));
    await assertFails(getDoc(doc(db, 'suppliers', 'sup_1')));
    await assertFails(getDoc(doc(db, 'categories', 'cat_1')));
    await assertFails(getDoc(doc(db, 'stock_movements', 'mov_1')));
    await assertFails(getDoc(doc(db, 'receipts', 'rec_1')));
    await assertFails(getDoc(doc(db, 'audit_logs', 'log_1')));
    await assertFails(getDoc(doc(db, 'notification_log', 'note_1')));
  });

  it('2. Google sign-up is treated the same way, provider is not a privilege', async () => {
    const db = asUser(env, 'uid_goog', 'googleuser@gmail.com', true);

    await assertSucceeds(
      auditedSet(db, 'uid_goog', ['users', 'uid_goog'], {
        name: 'Google User',
        email: 'googleuser@gmail.com',
        provider: 'google.com',
        role: 'production_staff',
        status: 'pending',
        emailVerified: true,
      })
    );
  });

  it('nobody can register themselves as active, or as a manager', async () => {
    const db = asUser(env, 'uid_cheat', 'cheat@example.com', true);

    await assertFails(
      auditedSet(db, 'uid_cheat', ['users', 'uid_cheat'], {
        name: 'Cheater',
        email: 'cheat@example.com',
        role: 'production_staff',
        status: 'active',
      })
    );

    await assertFails(
      auditedSet(db, 'uid_cheat', ['users', 'uid_cheat'], {
        name: 'Cheater',
        email: 'cheat@example.com',
        role: 'general_manager',
        status: 'pending',
      })
    );
  });

  it('a user cannot create a document for somebody else', async () => {
    const db = asUser(env, 'uid_a', 'a@example.com', true);

    await assertFails(
      auditedSet(db, 'uid_a', ['users', 'uid_b'], {
        name: 'Someone Else',
        email: 'b@example.com',
        role: 'production_staff',
        status: 'pending',
      })
    );
  });
});

// ============================================================
// 3 and 4. THE WEBMASTER IS AN EMAIL ADDRESS, VERIFIED
// ============================================================

describe('webmaster identity', () => {
  it('3. the verified webmaster address registers as an active webmaster', async () => {
    const db = asWebmaster(env, true);

    await assertSucceeds(
      auditedSet(db, 'uid_webmaster', ['users', 'uid_webmaster'], {
        name: 'Ted Martinez',
        email: WEBMASTER_EMAIL,
        provider: 'google.com',
        role: 'webmaster',
        status: 'active',
        emailVerified: true,
      })
    );
  });

  it('4. the same address unverified is never the webmaster', async () => {
    const db = asWebmaster(env, false);

    await assertFails(
      auditedSet(db, 'uid_webmaster', ['users', 'uid_webmaster'], {
        name: 'Unverified',
        email: WEBMASTER_EMAIL,
        role: 'webmaster',
        status: 'active',
      })
    );
  });

  it('4. a token carrying no email at all is never the webmaster', async () => {
    // An anonymous sign-in, for example. Not something this system offers,
    // but adding one later must not turn the webmaster check into an error.
    const db = env.authenticatedContext('uid_noemail', {}).firestore();

    await assertFails(
      auditedSet(db, 'uid_noemail', ['users', 'uid_noemail'], {
        name: 'No Email',
        role: 'webmaster',
        status: 'active',
      })
    );
  });

  it('4. look-alike addresses are never the webmaster', async () => {
    const lookalikes = [
      'tedcmartinez2@gmail.com.evil.com',
      'tedcmartinez2@googlemail.com',
      'tedcmartinez@gmail.com',
      'tedcmartinez2+x@gmail.com',
      'TEDCMARTINEZ2@GMAIL.COM',
    ];

    for (const email of lookalikes) {
      const db = asUser(env, `uid_${email}`, email, true);

      await assertFails(
        auditedSet(db, `uid_${email}`, ['users', `uid_${email}`], {
          name: 'Impostor',
          email,
          role: 'webmaster',
          status: 'active',
        })
      );
    }
  });
});

// ============================================================
// 5. AN APPROVED USER CAN WORK
// ============================================================

describe('approval unlocks the system', () => {
  it('5. a manager can approve a pending user', async () => {
    await seedActiveGM(env, 'uid_gm');
    await seedPendingStaff(env, 'uid_pending');

    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertSucceeds(
      auditedUpdate(db, 'uid_gm', ['users', 'uid_pending'], {
        status: 'active',
        approvedBy: 'uid_gm',
        approvedAt: serverTimestamp(),
      })
    );
  });

  it('5. an approved user can read materials and log a movement', async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedDoc(env, 'materials', 'mat_1', {
      name: 'Mahogany Plank',
      stockQuantity: 18,
      minThreshold: 30,
      unit: 'pcs',
    });

    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertSucceeds(getDoc(doc(db, 'materials', 'mat_1')));

    // A stock-out: the movement and the new quantity are written together
    const auditId = nextAuditId();
    const batch = writeBatch(db);
    batch.set(doc(db, 'stock_movements', 'mv_1'), {
      materialId: 'mat_1',
      materialName: 'Mahogany Plank',
      type: 'out',
      quantity: 5,
      beforeQty: 18,
      afterQty: 13,
      movementDate: '2026-10-31',
      reason: 'Project Usage',
      reference: 'order #102',
      notes: '',
      receiptId: null,
      loggedBy: 'uid_staff',
      loggedByName: 'Seeded User',
      createdAt: serverTimestamp(),
      lastAuditId: auditId,
    });
    batch.update(doc(db, 'materials', 'mat_1'), {
      stockQuantity: 13,
      updatedAt: serverTimestamp(),
      updatedBy: 'uid_staff',
      // Names the movement that justifies the new figure. The rules check it
      // matches, started from the quantity the server holds, and adds up.
      lastMovementId: 'mv_1',
      lastAuditId: auditId,
    });
    batch.set(doc(db, 'audit_logs', auditId), auditEntry('uid_staff', {
      action: 'stock.out',
      entity: 'stock_movements',
    }));

    await assertSucceeds(batch.commit());
  });

  it('a disabled user loses access again', async () => {
    await seedUser(env, 'uid_off', { status: 'disabled' });
    await seedDoc(env, 'materials', 'mat_1', { name: 'Steel Angle Bar' });

    const db = asUser(env, 'uid_off', 'off@example.com');

    await assertFails(getDoc(doc(db, 'materials', 'mat_1')));
  });

  it('a signed-out visitor can read nothing', async () => {
    await seedDoc(env, 'materials', 'mat_1', { name: 'Marine Plywood' });

    const db = asSignedOut(env);

    await assertFails(getDoc(doc(db, 'materials', 'mat_1')));
    await assertFails(getDocs(collection(db, 'audit_logs')));
  });
});

// ============================================================
// 6. STAFF NEVER SEE COST OR SUPPLIER
// This is the capstone's stated role requirement, and the reason cost and
// supplier were moved out of the materials document.
// ============================================================

describe('cost and supplier are manager only', () => {
  beforeEach(async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedActiveGM(env, 'uid_gm');
    await seedDoc(env, 'material_costs', 'mat_1', {
      costPerUnit: 220,
      supplierId: 'sup_1',
      supplierName: 'Antipolo Hardwood Supply',
    });
    await seedDoc(env, 'suppliers', 'sup_1', {
      name: 'Antipolo Hardwood Supply',
      viberContact: '09171234567',
      isArchived: false,
    });
  });

  it('6. staff reading material_costs is denied', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(getDoc(doc(db, 'material_costs', 'mat_1')));
    await assertFails(getDocs(collection(db, 'material_costs')));
  });

  it('6. staff reading suppliers is denied', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(getDoc(doc(db, 'suppliers', 'sup_1')));
    await assertFails(getDocs(collection(db, 'suppliers')));
  });

  it('6. staff writing a cost is denied', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(
      auditedSet(db, 'uid_staff', ['material_costs', 'mat_1'], {
        costPerUnit: 1,
        supplierId: 'sup_1',
      })
    );
  });

  it('6. the manager can read and write both', async () => {
    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertSucceeds(getDoc(doc(db, 'material_costs', 'mat_1')));
    await assertSucceeds(getDoc(doc(db, 'suppliers', 'sup_1')));
    await assertSucceeds(
      auditedUpdate(db, 'uid_gm', ['material_costs', 'mat_1'], {
        costPerUnit: 240,
      })
    );
  });

  it('6. the notification log is manager only', async () => {
    await seedDoc(env, 'notification_log', 'log_1', {
      materialId: 'mat_1',
      triggerType: 'low-stock',
      recipientEmail: 'gm@example.com',
      status: 'sent',
    });

    const staffDb = asUser(env, 'uid_staff', 'staff@example.com');
    const gmDb = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(getDoc(doc(staffDb, 'notification_log', 'log_1')));
    await assertSucceeds(getDoc(doc(gmDb, 'notification_log', 'log_1')));
  });

  it('no browser may write the notification log, not even the webmaster', async () => {
    await seedUser(env, 'uid_webmaster', {
      role: 'webmaster',
      email: WEBMASTER_EMAIL,
    });
    const db = asWebmaster(env, true);

    await assertFails(
      setDoc(doc(db, 'notification_log', 'log_new'), {
        materialId: 'mat_1',
        triggerType: 'low-stock',
        status: 'sent',
      })
    );
  });
});

// ============================================================
// 7. STAFF MAY MOVE STOCK, NOT EDIT THE CATALOG
// ============================================================

describe('what staff may change on a material', () => {
  beforeEach(async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedDoc(env, 'materials', 'mat_1', {
      name: 'Mahogany Plank',
      category: 'wood',
      unit: 'pcs',
      stockQuantity: 18,
      minThreshold: 30,
      isArchived: false,
    });
  });

  it('7. staff renaming a material is denied', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_staff', ['materials', 'mat_1'], {
        name: 'Renamed By Staff',
      })
    );
  });

  it('7. staff changing the threshold is denied', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_staff', ['materials', 'mat_1'], {
        minThreshold: 0,
      })
    );
  });

  it('7. staff archiving a material is denied', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_staff', ['materials', 'mat_1'], {
        isArchived: true,
      })
    );
  });

  it('staff cannot change the stock quantity on its own', async () => {
    // A quantity is the result of recorded movements, so it may only change
    // in a batch that also files the movement explaining it. Without that,
    // a figure could be rewritten with no record of who moved what. The
    // movement-backed path is covered in tests/integration/stale-write.
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_staff', ['materials', 'mat_1'], {
        stockQuantity: 13,
        updatedAt: serverTimestamp(),
        updatedBy: 'uid_staff',
      })
    );
  });

  it('a manager cannot change the stock quantity on its own either', async () => {
    await seedActiveGM(env, 'uid_gm');
    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_gm', ['materials', 'mat_1'], {
        stockQuantity: 999,
        updatedAt: serverTimestamp(),
        updatedBy: 'uid_gm',
      })
    );
  });

  it('a manager may still edit the catalog, which leaves the quantity alone', async () => {
    await seedActiveGM(env, 'uid_gm');
    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertSucceeds(
      auditedUpdate(db, 'uid_gm', ['materials', 'mat_1'], {
        name: 'Mahogany Plank, Premium',
        minThreshold: 35,
        updatedAt: serverTimestamp(),
        updatedBy: 'uid_gm',
      })
    );
  });

  it('staff may add a material but must leave the threshold at zero', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertSucceeds(
      auditedSet(db, 'uid_staff', ['materials', 'mat_new'], {
        name: 'Contact Adhesive Gallon',
        category: 'adhesives',
        unit: 'can',
        stockQuantity: 3,
        minThreshold: 0,
        isArchived: false,
      })
    );

    await assertFails(
      auditedSet(db, 'uid_staff', ['materials', 'mat_other'], {
        name: 'Sneaky Threshold',
        category: 'wood',
        unit: 'pcs',
        stockQuantity: 3,
        minThreshold: 25,
        isArchived: false,
      })
    );
  });

  it('nothing can be hard deleted', async () => {
    await seedActiveGM(env, 'uid_gm');
    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(deleteDoc(doc(db, 'materials', 'mat_1')));
    await assertFails(deleteDoc(doc(db, 'users', 'uid_staff')));
  });
});

// ============================================================
// 8 and 9. WHO MAY CHANGE WHOSE ACCOUNT
//
//   Webmaster   every account except its own: approve, disable,
//               re-enable, promote staff to manager, demote back.
//   Manager     approve, disable, re-enable and demote other managers and
//               staff, but never promote anyone to manager, and never
//               touch the webmaster.
//   Everyone    never their own role or status.
// ============================================================

async function seedWebmaster() {
  await seedUser(env, 'uid_webmaster', { role: 'webmaster', email: WEBMASTER_EMAIL });
}

const asGM = () => asUser(env, 'uid_gm', 'gm@example.com');
const asWM = () => asWebmaster(env, true);

describe('what a manager may do to other accounts', () => {
  beforeEach(async () => {
    await seedActiveGM(env, 'uid_gm');
  });

  it('8. a manager disabling another manager is allowed', async () => {
    await seedActiveGM(env, 'uid_gm2');

    await assertSucceeds(
      auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_gm2'], { status: 'disabled' })
    );
  });

  it('8. a manager re-enabling another manager is allowed, and is not a promotion', async () => {
    // The role stays general_manager throughout, so nothing is granted
    await seedUser(env, 'uid_gm2', { role: 'general_manager', status: 'disabled' });

    await assertSucceeds(
      auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_gm2'], { status: 'active' })
    );
  });

  it('8. a manager demoting another manager to staff is allowed', async () => {
    await seedActiveGM(env, 'uid_gm2');

    await assertSucceeds(
      auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_gm2'], { role: 'production_staff' })
    );
  });

  it('8. a manager promoting staff to manager is denied', async () => {
    await seedActiveStaff(env, 'uid_staff');

    await assertFails(
      auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_staff'], { role: 'general_manager' })
    );
  });

  it('8. a manager promoting a pending account to manager is denied', async () => {
    // Approving and promoting in one write would be a promotion by another route
    await seedPendingStaff(env, 'uid_new');

    await assertFails(
      auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_new'], {
        role: 'general_manager',
        status: 'active',
      })
    );
  });

  it('a manager may still approve, disable and re-enable staff', async () => {
    await seedPendingStaff(env, 'uid_new');
    await seedActiveStaff(env, 'uid_staff');
    await seedUser(env, 'uid_off', { role: 'production_staff', status: 'disabled' });

    await assertSucceeds(
      auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_new'], {
        status: 'active',
        approvedBy: 'uid_gm',
        approvedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_staff'], { status: 'disabled' }));
    await assertSucceeds(auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_off'], { status: 'active' }));
  });

  it('9. a manager editing the webmaster in any way is denied', async () => {
    await seedWebmaster();

    for (const change of [
      { status: 'disabled' },
      { role: 'production_staff' },
      { role: 'general_manager' },
      { approvedBy: 'uid_gm' },
    ]) {
      await assertFails(auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_webmaster'], change));
    }
  });

  it('nobody may give an account a role or status the system does not know', async () => {
    await seedActiveStaff(env, 'uid_staff');

    await assertFails(auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_staff'], { role: 'owner' }));
    await assertFails(auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_staff'], { status: 'banned' }));
  });

  it('nobody may make an account the webmaster', async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedWebmaster();

    await assertFails(auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_staff'], { role: 'webmaster' }));
    await assertFails(
      auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_staff'], { role: 'webmaster' })
    );
  });

  it('9. staff cannot change anybody', async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedActiveStaff(env, 'uid_staff2');
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(auditedUpdate(db, 'uid_staff', ['users', 'uid_gm'], { status: 'disabled' }));
    await assertFails(auditedUpdate(db, 'uid_staff', ['users', 'uid_staff2'], { status: 'disabled' }));
  });
});

describe('what the webmaster may do to other accounts', () => {
  beforeEach(async () => {
    await seedWebmaster();
  });

  it('8. the webmaster promoting staff to manager is allowed', async () => {
    await seedActiveStaff(env, 'uid_staff');

    await assertSucceeds(
      auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_staff'], { role: 'general_manager' })
    );
  });

  it('the webmaster demoting a manager to staff is allowed', async () => {
    await seedActiveGM(env, 'uid_gm');

    await assertSucceeds(
      auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_gm'], { role: 'production_staff' })
    );
  });

  it('the webmaster may approve, disable and re-enable any other account', async () => {
    await seedPendingStaff(env, 'uid_new');
    await seedActiveGM(env, 'uid_gm');
    await seedUser(env, 'uid_off', { role: 'general_manager', status: 'disabled' });

    await assertSucceeds(
      auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_new'], {
        status: 'active',
        approvedBy: 'uid_webmaster',
        approvedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_gm'], { status: 'disabled' }));
    await assertSucceeds(auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_off'], { status: 'active' }));
  });
});

describe('nobody may change their own role or status', () => {
  it('staff, including approving themselves or claiming manager', async () => {
    await seedPendingStaff(env, 'uid_self');
    const db = asUser(env, 'uid_self', 'self@example.com');

    await assertFails(auditedUpdate(db, 'uid_self', ['users', 'uid_self'], { status: 'active' }));
    await assertFails(auditedUpdate(db, 'uid_self', ['users', 'uid_self'], { role: 'general_manager' }));
  });

  it('a manager, including disabling or demoting themselves', async () => {
    await seedActiveGM(env, 'uid_gm');

    await assertFails(auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_gm'], { status: 'disabled' }));
    await assertFails(auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_gm'], { role: 'production_staff' }));
  });

  it('the webmaster, including disabling or demoting themselves', async () => {
    await seedWebmaster();

    await assertFails(auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_webmaster'], { status: 'disabled' }));
    await assertFails(auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_webmaster'], { role: 'general_manager' }));
  });

  it('a user may still update their own profile details', async () => {
    await seedActiveStaff(env, 'uid_staff');
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertSucceeds(
      auditedUpdate(db, 'uid_staff', ['users', 'uid_staff'], {
        name: 'Updated Name',
        lastLoginAt: serverTimestamp(),
      })
    );
  });
});

// ============================================================
// ROLES CHANGE ONLY ON ACTIVE ACCOUNTS
// ============================================================

describe('role changes need an active account', () => {
  beforeEach(async () => {
    await seedWebmaster();
    await seedActiveGM(env, 'uid_gm');
  });

  it('nobody changes the role of a disabled account', async () => {
    await seedUser(env, 'uid_off', { role: 'production_staff', status: 'disabled' });
    await seedUser(env, 'uid_offgm', { role: 'general_manager', status: 'disabled' });

    await assertFails(
      auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_off'], { role: 'general_manager' })
    );
    await assertFails(
      auditedUpdate(asGM(), 'uid_gm', ['users', 'uid_offgm'], { role: 'production_staff' })
    );
  });

  it('nobody changes the role of a pending account', async () => {
    await seedPendingStaff(env, 'uid_new');

    await assertFails(
      auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_new'], { role: 'general_manager' })
    );
  });

  it('re-enabling and changing the role in one write is refused', async () => {
    await seedUser(env, 'uid_off', { role: 'production_staff', status: 'disabled' });

    await assertFails(
      auditedUpdate(asWM(), 'uid_webmaster', ['users', 'uid_off'], {
        status: 'active',
        role: 'general_manager',
      })
    );
  });
});

// ============================================================
// DELETING ACCOUNTS
//
// Only disabled accounts, never your own, never the webmaster's, only by a
// manager or the webmaster, and only with a user.delete audit entry named
// after the account's current lastAuditId.
// ============================================================

// The same id deleteAuditId() in src/lib/audit.js builds. Seeded users all
// carry lastAuditId 'seed'.
const deleteLogId = (uid, lastAuditId = 'seed') => `user-delete-${uid}-${lastAuditId}`;

function auditedDelete(db, actorUid, uid, options = {}) {
  const logId = options.logId || deleteLogId(uid);
  const batch = writeBatch(db);

  batch.delete(doc(db, 'users', uid));

  if (options.skipLog !== true) {
    batch.set(
      doc(db, 'audit_logs', logId),
      auditEntry(actorUid, {
        action: 'user.delete',
        entity: 'users',
        entityId: uid,
        ...options.auditOverrides,
      })
    );
  }

  return batch.commit();
}

describe('deleting accounts', () => {
  beforeEach(async () => {
    await seedWebmaster();
    await seedActiveGM(env, 'uid_gm');
  });

  it('a manager may delete a disabled staff account', async () => {
    await seedUser(env, 'uid_off', { role: 'production_staff', status: 'disabled' });

    await assertSucceeds(auditedDelete(asGM(), 'uid_gm', 'uid_off'));
  });

  it('a manager may delete a disabled manager account', async () => {
    await seedUser(env, 'uid_offgm', { role: 'general_manager', status: 'disabled' });

    await assertSucceeds(auditedDelete(asGM(), 'uid_gm', 'uid_offgm'));
  });

  it('the webmaster may delete any disabled account', async () => {
    await seedUser(env, 'uid_off', { role: 'production_staff', status: 'disabled' });
    await seedUser(env, 'uid_offgm', { role: 'general_manager', status: 'disabled' });

    await assertSucceeds(auditedDelete(asWM(), 'uid_webmaster', 'uid_off'));
    await assertSucceeds(auditedDelete(asWM(), 'uid_webmaster', 'uid_offgm'));
  });

  it('an active or pending account cannot be deleted', async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedPendingStaff(env, 'uid_new');

    await assertFails(auditedDelete(asWM(), 'uid_webmaster', 'uid_staff'));
    await assertFails(auditedDelete(asGM(), 'uid_gm', 'uid_new'));
  });

  it('nobody deletes their own account', async () => {
    await assertFails(auditedDelete(asGM(), 'uid_gm', 'uid_gm'));
    await assertFails(auditedDelete(asWM(), 'uid_webmaster', 'uid_webmaster'));
  });

  it('the webmaster account can never be deleted, even if marked disabled', async () => {
    await seedUser(env, 'uid_webmaster', {
      role: 'webmaster',
      email: WEBMASTER_EMAIL,
      status: 'disabled',
    });

    await assertFails(auditedDelete(asGM(), 'uid_gm', 'uid_webmaster'));
  });

  it('staff cannot delete anyone', async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedUser(env, 'uid_off', { role: 'production_staff', status: 'disabled' });

    const db = asUser(env, 'uid_staff', 'staff@example.com');
    await assertFails(auditedDelete(db, 'uid_staff', 'uid_off'));
  });

  it('a delete without its audit entry is refused', async () => {
    await seedUser(env, 'uid_off', { role: 'production_staff', status: 'disabled' });

    await assertFails(auditedDelete(asGM(), 'uid_gm', 'uid_off', { skipLog: true }));
  });

  it('the entry must carry the expected name, action and account', async () => {
    await seedUser(env, 'uid_off', { role: 'production_staff', status: 'disabled' });

    // A random name the rules cannot connect to this account
    await assertFails(auditedDelete(asGM(), 'uid_gm', 'uid_off', { logId: nextAuditId() }));

    // The right name, but describing something else
    await assertFails(
      auditedDelete(asGM(), 'uid_gm', 'uid_off', { auditOverrides: { action: 'user.disable' } })
    );
    await assertFails(
      auditedDelete(asGM(), 'uid_gm', 'uid_off', { auditOverrides: { entityId: 'uid_someone' } })
    );
  });

  it('an existing entry cannot be reused for a delete', async () => {
    await seedUser(env, 'uid_off', { role: 'production_staff', status: 'disabled' });
    await seedDoc(env, 'audit_logs', deleteLogId('uid_off'), {
      action: 'user.delete',
      entityId: 'uid_off',
    });

    // The entry already exists, so it proves nothing about this delete
    const db = asGM();
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', 'uid_off'));
    await assertFails(batch.commit());
  });

  it('a deleted person may register again as a new pending request', async () => {
    await seedUser(env, 'uid_off', {
      role: 'production_staff',
      status: 'disabled',
      email: 'back@example.com',
    });
    await assertSucceeds(auditedDelete(asGM(), 'uid_gm', 'uid_off'));

    const db = asUser(env, 'uid_off', 'back@example.com');
    await assertSucceeds(
      auditedSet(db, 'uid_off', ['users', 'uid_off'], {
        name: 'Back Again',
        email: 'back@example.com',
        role: 'production_staff',
        status: 'pending',
      })
    );
  });
});

// ============================================================
// THE VERIFIED FLAG FOLLOWS THE TOKEN
// ============================================================

describe('emailVerified on your own account', () => {
  it('may be set true when the sign-in token says the address is verified', async () => {
    await seedUser(env, 'uid_new', { status: 'pending', emailVerified: false });
    const db = asUser(env, 'uid_new', 'new@example.com', true);

    await assertSucceeds(auditedUpdate(db, 'uid_new', ['users', 'uid_new'], { emailVerified: true }));
  });

  it('may not be set true while the token says it is not', async () => {
    await seedUser(env, 'uid_new', { status: 'pending', emailVerified: false });
    const db = asUser(env, 'uid_new', 'new@example.com', false);

    await assertFails(auditedUpdate(db, 'uid_new', ['users', 'uid_new'], { emailVerified: true }));
  });

  it('other profile edits are unaffected by the token', async () => {
    await seedUser(env, 'uid_new', { status: 'pending', emailVerified: false });
    const db = asUser(env, 'uid_new', 'new@example.com', false);

    await assertSucceeds(auditedUpdate(db, 'uid_new', ['users', 'uid_new'], { name: 'New Name' }));
  });
});

// ============================================================
// 10 and 11. THE AUDIT TRAIL CANNOT BE AVOIDED OR ALTERED
// ============================================================

describe('audit trail enforcement', () => {
  beforeEach(async () => {
    await seedActiveGM(env, 'uid_gm');
    await seedDoc(env, 'materials', 'mat_1', {
      name: 'Marine Plywood 18mm',
      stockQuantity: 40,
      minThreshold: 20,
      isArchived: false,
    });
  });

  it('10. a write with no audit log at all is denied', async () => {
    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(
      updateDoc(doc(db, 'materials', 'mat_1'), { name: 'No Log Written' })
    );
  });

  it('10. a write naming an audit id that is never created is denied', async () => {
    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(
      auditedUpdate(
        db,
        'uid_gm',
        ['materials', 'mat_1'],
        { name: 'Dangling Audit Reference' },
        { skipLog: true }
      )
    );
  });

  it('10. reusing an audit id that already exists is denied', async () => {
    const reused = 'audit_already_on_file';
    await seedDoc(env, 'audit_logs', reused, {
      action: 'material.update',
      entity: 'materials',
      actorUid: 'uid_gm',
      timestamp: new Date(),
    });

    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(
      auditedUpdate(
        db,
        'uid_gm',
        ['materials', 'mat_1'],
        { name: 'Recycled Audit Id' },
        { auditId: reused, skipLog: true }
      )
    );
  });

  it('10. an audit entry cannot be filed under somebody else', async () => {
    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(
      auditedUpdate(
        db,
        'uid_gm',
        ['materials', 'mat_1'],
        { name: 'Blamed On Staff' },
        { auditOverrides: { actorUid: 'uid_someone_else' } }
      )
    );
  });

  it('10. an audit entry cannot be backdated, the server clock is required', async () => {
    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(
      auditedUpdate(
        db,
        'uid_gm',
        ['materials', 'mat_1'],
        { name: 'Backdated' },
        { auditOverrides: { timestamp: new Date('2020-01-01') } }
      )
    );
  });

  it('11. an audit entry cannot be edited, by any role', async () => {
    await seedUser(env, 'uid_webmaster', {
      role: 'webmaster',
      email: WEBMASTER_EMAIL,
    });
    await seedActiveStaff(env, 'uid_staff');
    await seedDoc(env, 'audit_logs', 'log_1', {
      action: 'stock.out',
      entity: 'stock_movements',
      actorUid: 'uid_staff',
      summary: 'Stock out 20 pcs, Mahogany Plank',
      timestamp: new Date(),
    });

    const contexts = [
      asUser(env, 'uid_gm', 'gm@example.com'),
      asUser(env, 'uid_staff', 'staff@example.com'),
      asWebmaster(env, true),
    ];

    for (const db of contexts) {
      await assertFails(
        updateDoc(doc(db, 'audit_logs', 'log_1'), { summary: 'Rewritten' })
      );
      await assertFails(deleteDoc(doc(db, 'audit_logs', 'log_1')));
    }
  });

  it('11. the audit trail is readable by managers, not by staff', async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedDoc(env, 'audit_logs', 'log_1', {
      action: 'stock.out',
      entity: 'stock_movements',
      actorUid: 'uid_staff',
      timestamp: new Date(),
    });

    await assertSucceeds(
      getDoc(doc(asUser(env, 'uid_gm', 'gm@example.com'), 'audit_logs', 'log_1'))
    );
    await assertFails(
      getDoc(doc(asUser(env, 'uid_staff', 'staff@example.com'), 'audit_logs', 'log_1'))
    );
  });
});

// ============================================================
// 12. STOCK CANNOT GO BELOW ZERO, AND HISTORY IS IMMUTABLE
// ============================================================

describe('stock movements', () => {
  beforeEach(async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedDoc(env, 'materials', 'mat_1', {
      name: 'Foam Padding Roll',
      stockQuantity: 10,
      minThreshold: 5,
      unit: 'roll',
      isArchived: false,
    });
  });

  // Builds the movement + material + audit batch the application uses
  function stockOut(db, uid, quantity, beforeQty) {
    const auditId = nextAuditId();
    const afterQty = beforeQty - quantity;
    const batch = writeBatch(db);

    batch.set(doc(db, 'stock_movements', `mv_${auditId}`), {
      materialId: 'mat_1',
      materialName: 'Foam Padding Roll',
      type: 'out',
      quantity,
      beforeQty,
      afterQty,
      movementDate: '2026-10-31',
      reason: 'Project Usage',
      loggedBy: uid,
      loggedByName: 'Seeded User',
      createdAt: serverTimestamp(),
      lastAuditId: auditId,
    });
    batch.update(doc(db, 'materials', 'mat_1'), {
      stockQuantity: afterQty,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      lastMovementId: `mv_${auditId}`,
      lastAuditId: auditId,
    });
    batch.set(doc(db, 'audit_logs', auditId), auditEntry(uid, {
      action: 'stock.out',
      entity: 'stock_movements',
    }));

    return batch.commit();
  }

  it('12. a stock-out larger than what is on hand is blocked', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(stockOut(db, 'uid_staff', 25, 10));
  });

  it('12. a stock-out down to exactly zero is allowed', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertSucceeds(stockOut(db, 'uid_staff', 10, 10));
  });

  it('a movement cannot be attributed to another user', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');
    const auditId = nextAuditId();
    const batch = writeBatch(db);

    batch.set(doc(db, 'stock_movements', 'mv_fake'), {
      materialId: 'mat_1',
      type: 'out',
      quantity: 1,
      beforeQty: 10,
      afterQty: 9,
      movementDate: '2026-10-31',
      loggedBy: 'uid_somebody_else',
      createdAt: serverTimestamp(),
      lastAuditId: auditId,
    });
    batch.set(doc(db, 'audit_logs', auditId), auditEntry('uid_staff'));

    await assertFails(batch.commit());
  });

  it('a zero or negative quantity is rejected', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(stockOut(db, 'uid_staff', 0, 10));
    await assertFails(stockOut(db, 'uid_staff', -5, 10));
  });

  it('movement history cannot be edited or deleted', async () => {
    await seedDoc(env, 'stock_movements', 'mv_1', {
      materialId: 'mat_1',
      type: 'out',
      quantity: 5,
      loggedBy: 'uid_staff',
    });
    await seedActiveGM(env, 'uid_gm');

    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(updateDoc(doc(db, 'stock_movements', 'mv_1'), { quantity: 1 }));
    await assertFails(deleteDoc(doc(db, 'stock_movements', 'mv_1')));
  });
});

// ============================================================
// 19. RECEIPT SIZE CEILING
// The browser compresses before upload, but the limit is enforced here too
// so an oversized image cannot be pushed past that step.
// ============================================================

describe('receipts', () => {
  beforeEach(async () => {
    await seedActiveStaff(env, 'uid_staff');
  });

  it('19. a receipt within the size limit is accepted', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertSucceeds(
      auditedSet(db, 'uid_staff', ['receipts', 'rec_1'], {
        movementId: 'mv_1',
        mimeType: 'image/jpeg',
        dataBase64: 'x'.repeat(1000),
        sizeBytes: 250000,
        uploadedBy: 'uid_staff',
        createdAt: serverTimestamp(),
      })
    );
  });

  it('19. an oversized receipt is rejected', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(
      auditedSet(db, 'uid_staff', ['receipts', 'rec_2'], {
        movementId: 'mv_1',
        mimeType: 'image/jpeg',
        dataBase64: 'x'.repeat(1000),
        sizeBytes: 450000,
        uploadedBy: 'uid_staff',
        createdAt: serverTimestamp(),
      })
    );
  });

  it('a receipt cannot be reassigned to another uploader', async () => {
    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(
      auditedSet(db, 'uid_staff', ['receipts', 'rec_3'], {
        movementId: 'mv_1',
        mimeType: 'image/jpeg',
        dataBase64: 'x',
        sizeBytes: 100,
        uploadedBy: 'uid_someone_else',
        createdAt: serverTimestamp(),
      })
    );
  });

  it('receipts cannot be overwritten or deleted once filed', async () => {
    await seedDoc(env, 'receipts', 'rec_seed', {
      movementId: 'mv_1',
      sizeBytes: 100,
      uploadedBy: 'uid_staff',
    });

    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(updateDoc(doc(db, 'receipts', 'rec_seed'), { sizeBytes: 1 }));
    await assertFails(deleteDoc(doc(db, 'receipts', 'rec_seed')));
  });
});

// ============================================================
// Collections that do not exist are closed by the catch-all rule
// ============================================================

describe('unknown collections', () => {
  it('an invented collection is denied even to the webmaster', async () => {
    await seedUser(env, 'uid_webmaster', {
      role: 'webmaster',
      email: WEBMASTER_EMAIL,
    });
    const db = asWebmaster(env, true);

    await assertFails(getDocs(collection(db, 'categories')));
    await assertFails(setDoc(doc(db, 'anything_else', 'x'), { a: 1 }));
  });
});

// ============================================================
// STOCK ADJUSTMENTS: MANAGER AND WEBMASTER ONLY
// The catalog offers Adjust Stock to both; these prove the server agrees,
// and refuses staff whatever the page might draw.
// ============================================================

describe('stock adjustments', () => {
  beforeEach(async () => {
    await seedDoc(env, 'materials', 'mat_1', {
      name: 'Mahogany Plank',
      stockQuantity: 18,
      minThreshold: 30,
      unit: 'pcs',
      isArchived: false,
    });
  });

  // The batch the Adjust Stock modal writes: counted 15 against 18
  function adjustment(db, uid) {
    const auditId = nextAuditId();
    const movementId = `mv_adjust_${auditId}`;
    const batch = writeBatch(db);

    batch.set(doc(db, 'stock_movements', movementId), {
      materialId: 'mat_1',
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
      loggedByName: 'Seeded User',
      createdAt: serverTimestamp(),
      lastAuditId: auditId,
    });
    batch.update(doc(db, 'materials', 'mat_1'), {
      stockQuantity: 15,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
      lastMovementId: movementId,
      lastAuditId: auditId,
    });
    batch.set(doc(db, 'audit_logs', auditId), auditEntry(uid, {
      action: 'stock.adjust',
      entity: 'stock_movements',
    }));

    return batch.commit();
  }

  it('a general manager may adjust stock', async () => {
    await seedActiveGM(env, 'uid_gm');
    await assertSucceeds(adjustment(asUser(env, 'uid_gm', 'gm@example.com'), 'uid_gm'));
  });

  it('the webmaster may adjust stock', async () => {
    await seedUser(env, 'uid_webmaster', { role: 'webmaster', email: WEBMASTER_EMAIL });
    await assertSucceeds(adjustment(asWebmaster(env, true), 'uid_webmaster'));
  });

  it('production staff may not adjust stock', async () => {
    await seedActiveStaff(env, 'uid_staff');
    await assertFails(adjustment(asUser(env, 'uid_staff', 'staff@example.com'), 'uid_staff'));
  });
});
