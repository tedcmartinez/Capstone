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
// 8 and 9. ONLY THE WEBMASTER TOUCHES MANAGER ROLES
// ============================================================

describe('role escalation', () => {
  it('8. a manager granting general_manager is denied', async () => {
    await seedActiveGM(env, 'uid_gm');
    await seedActiveStaff(env, 'uid_staff');

    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_gm', ['users', 'uid_staff'], {
        role: 'general_manager',
      })
    );
  });

  it('8. the webmaster can grant general_manager', async () => {
    await seedUser(env, 'uid_webmaster', {
      role: 'webmaster',
      email: WEBMASTER_EMAIL,
    });
    await seedActiveStaff(env, 'uid_staff');

    const db = asWebmaster(env, true);

    await assertSucceeds(
      auditedUpdate(db, 'uid_webmaster', ['users', 'uid_staff'], {
        role: 'general_manager',
      })
    );
  });

  it('8. a manager cannot demote another manager', async () => {
    await seedActiveGM(env, 'uid_gm');
    await seedActiveGM(env, 'uid_gm2');

    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_gm', ['users', 'uid_gm2'], {
        role: 'production_staff',
      })
    );
  });

  it('9. a manager cannot edit or disable the webmaster', async () => {
    await seedActiveGM(env, 'uid_gm');
    await seedUser(env, 'uid_webmaster', {
      role: 'webmaster',
      email: WEBMASTER_EMAIL,
    });

    const db = asUser(env, 'uid_gm', 'gm@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_gm', ['users', 'uid_webmaster'], {
        status: 'disabled',
      })
    );
    await assertFails(
      auditedUpdate(db, 'uid_gm', ['users', 'uid_webmaster'], {
        role: 'production_staff',
      })
    );
  });

  it('9. staff cannot disable anybody', async () => {
    await seedActiveStaff(env, 'uid_staff');
    await seedActiveGM(env, 'uid_gm');

    const db = asUser(env, 'uid_staff', 'staff@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_staff', ['users', 'uid_gm'], {
        status: 'disabled',
      })
    );
  });

  it('nobody can approve or promote themselves', async () => {
    await seedPendingStaff(env, 'uid_self');
    const db = asUser(env, 'uid_self', 'self@example.com');

    await assertFails(
      auditedUpdate(db, 'uid_self', ['users', 'uid_self'], {
        status: 'active',
      })
    );
    await assertFails(
      auditedUpdate(db, 'uid_self', ['users', 'uid_self'], {
        role: 'general_manager',
      })
    );
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
