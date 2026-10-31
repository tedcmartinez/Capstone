// The Apps Script, run outside Apps Script
//
// Code.gs only ever runs on Google's servers, which would normally leave the
// alert rules untested until an email does or does not arrive. Instead the
// file is loaded here into a sandbox that supplies its own versions of the
// Google services it calls: UrlFetchApp, MailApp, CacheService and so on,
// plus a small in-memory Firestore that answers the REST requests the script
// makes. The script code itself is unchanged, so these test what is deployed.
//
// This covers acceptance test 13 as far as code can: an alert when stock
// crosses the threshold, none for a repeat within 24 hours, and a stock-out
// alert to the manager at zero. Whether the email then looks right in the
// Gmail app on a phone is test 14, which needs a phone.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync('apps-script/Code.gs', 'utf8');

// ============================================================
// THE FAKE GOOGLE ENVIRONMENT
// ============================================================

function createEnvironment() {
  const store = {
    users: {},
    materials: {},
    material_costs: {},
    notification_log: {},
  };
  const tokens = {};
  const sentMail = [];
  const failingAddresses = new Set();
  const cache = new Map();
  const lock = { acquired: 0, released: 0 };
  let quota = 100;
  let nextId = 1;
  let firestoreFailure = null;

  // ---- Firestore's REST value encoding ----
  function encode(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    }
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    return { stringValue: String(value) };
  }

  function decode(value) {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return new Date(value.timestampValue);
    return null;
  }

  function asDocument(collection, id, data) {
    const fields = {};
    for (const [key, value] of Object.entries(data)) fields[key] = encode(value);
    return { name: `projects/p/databases/(default)/documents/${collection}/${id}`, fields };
  }

  // ---- The structured queries the script runs ----
  function matches(data, filter) {
    if (!filter) return true;
    if (filter.compositeFilter) return filter.compositeFilter.filters.every((f) => matches(data, f));

    const { field, op, value } = filter.fieldFilter;
    const actual = data[field.fieldPath];
    const expected = decode(value);
    const a = actual instanceof Date ? actual.getTime() : actual;
    const e = expected instanceof Date ? expected.getTime() : expected;

    if (op === 'EQUAL') return a === e;
    if (op === 'GREATER_THAN_OR_EQUAL') return a >= e;
    throw new Error(`The fake Firestore does not support ${op}`);
  }

  function runQuery({ structuredQuery }) {
    const collection = structuredQuery.from[0].collectionId;
    let rows = Object.entries(store[collection] || {}).filter(([, data]) =>
      matches(data, structuredQuery.where)
    );

    for (const order of structuredQuery.orderBy || []) {
      const key = order.field.fieldPath;
      const sign = order.direction === 'DESCENDING' ? -1 : 1;
      rows.sort(([, a], [, b]) => (a[key] > b[key] ? sign : a[key] < b[key] ? -sign : 0));
    }
    if (structuredQuery.limit) rows = rows.slice(0, structuredQuery.limit);

    // An empty result from the real API is one element with no document
    if (rows.length === 0) return [{ readTime: new Date().toISOString() }];
    return rows.map(([id, data]) => ({ document: asDocument(collection, id, data) }));
  }

  function reply(code, body) {
    return {
      getResponseCode: () => code,
      getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  }

  const UrlFetchApp = {
    fetch(url, options = {}) {
      const payload = options.payload ? JSON.parse(options.payload) : null;

      if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
        const account = tokens[payload.idToken];
        return account ? reply(200, { users: [account] }) : reply(400, { error: { message: 'INVALID_ID_TOKEN' } });
      }

      if (url.includes('firestore.googleapis.com')) {
        if (firestoreFailure) return reply(firestoreFailure.code, firestoreFailure.body);

        const path = url.split('/documents')[1];

        if (path === ':runQuery') return reply(200, runQuery(payload));

        const [, collection, id] = path.split('/');

        if (options.method === 'post' && !id) {
          const newId = `auto_${nextId++}`;
          const data = {};
          for (const [key, value] of Object.entries(payload.fields)) data[key] = decode(value);
          store[collection][newId] = data;
          return reply(200, asDocument(collection, newId, data));
        }

        const data = store[collection]?.[id];
        return data ? reply(200, asDocument(collection, id, data)) : reply(404, {});
      }

      throw new Error(`Unexpected fetch to ${url}`);
    },
  };

  const MailApp = {
    sendEmail(message) {
      if (failingAddresses.has(message.to)) throw new Error('Invalid email');
      quota -= 1;
      sentMail.push(message);
    },
    getRemainingDailyQuota: () => quota,
  };

  const context = {
    UrlFetchApp,
    MailApp,
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) ?? null,
        put: (key, value) => cache.set(key, value),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { lock.acquired += 1; },
        releaseLock: () => { lock.released += 1; },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
    // Honours the two patterns the script uses, so a subject line built with
    // the date-only pattern is checked against the date only
    Utilities: {
      formatDate: (_date, _zone, pattern) =>
        pattern === 'MMMM d, yyyy' ? 'November 1, 2026' : 'November 1, 2026 at 9:30 AM',
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'cornerblock.alerts@gmail.com' }) },
    ScriptApp: { getOAuthToken: () => 'owner-oauth-token' },
    console: { error: () => {}, log: () => {} },
    Date,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    Error,
  };

  vm.createContext(context);
  vm.runInContext(SOURCE, context);

  return {
    script: context,
    store,
    sentMail,
    lock,
    cache,
    // A signed-in person: an ID token Identity Toolkit will accept, and the
    // profile document in Firestore
    addUser(uid, { email, role, status = 'active', name = uid, emailVerified = true }) {
      tokens[`token-${uid}`] = { localId: uid, email, emailVerified };
      store.users[uid] = { name, email, role, status };
      return `token-${uid}`;
    },
    addMaterial(id, data) {
      store.materials[id] = { isArchived: false, unit: 'pcs', ...data };
    },
    failMailTo: (address) => failingAddresses.add(address),
    setQuota: (n) => { quota = n; },
    failFirestore: (code, body) => { firestoreFailure = { code, body }; },
    post(request) {
      const output = context.doPost({ postData: { contents: JSON.stringify(request) } });
      return JSON.parse(output.text);
    },
    logRows: () => Object.values(store.notification_log),
  };
}

let env;
let staffToken;
let gmToken;

beforeEach(() => {
  env = createEnvironment();
  staffToken = env.addUser('staff1', { email: 'juan@example.com', role: 'production_staff' });
  env.addUser('staff2', { email: 'maria@example.com', role: 'production_staff' });
  gmToken = env.addUser('gm1', { email: 'gm@example.com', role: 'general_manager' });
  env.addUser('off', { email: 'former@example.com', role: 'general_manager', status: 'disabled' });
  env.addUser('webmaster', { email: 'tedcmartinez2@gmail.com', role: 'webmaster' });
});

// ============================================================
// THE RULES, AS PLAIN FUNCTIONS
// ============================================================

describe('which alerts are due', () => {
  it('calls for a low-stock alert at or below the threshold', () => {
    expect(env.script.alertsDue({ stockQuantity: 18, minThreshold: 30 })).toEqual(['low-stock']);
    expect(env.script.alertsDue({ stockQuantity: 30, minThreshold: 30 })).toEqual(['low-stock']);
  });

  it('calls for both alerts at zero, exactly as the PHP did', () => {
    expect(env.script.alertsDue({ stockQuantity: 0, minThreshold: 5 })).toEqual(['low-stock', 'stock-out']);
  });

  it('calls for nothing above the threshold', () => {
    expect(env.script.alertsDue({ stockQuantity: 31, minThreshold: 30 })).toEqual([]);
  });
});

describe('who receives an alert', () => {
  const users = [
    { email: 'juan@example.com', role: 'production_staff', status: 'active' },
    { email: 'gm@example.com', role: 'general_manager', status: 'active' },
    { email: 'former@example.com', role: 'general_manager', status: 'disabled' },
    { email: 'pending@example.com', role: 'production_staff', status: 'pending' },
    { email: 'tedcmartinez2@gmail.com', role: 'webmaster', status: 'active' },
    { email: 'GM@example.com', role: 'general_manager', status: 'active' },
  ];

  it('sends low stock to active staff and managers', () => {
    expect(env.script.alertRecipients(users, 'low-stock')).toEqual(['juan@example.com', 'gm@example.com']);
  });

  it('sends a stock-out to managers only', () => {
    expect(env.script.alertRecipients(users, 'stock-out')).toEqual(['gm@example.com']);
  });

  it('skips disabled and pending accounts, and the webmaster', () => {
    const all = env.script.alertRecipients(users, 'low-stock');

    expect(all).not.toContain('former@example.com');
    expect(all).not.toContain('pending@example.com');
    expect(all).not.toContain('tedcmartinez2@gmail.com');
  });

  it('sends one copy to an address listed twice in different case', () => {
    expect(env.script.alertRecipients(users, 'stock-out')).toHaveLength(1);
  });
});

// ============================================================
// checkStock, END TO END
// ============================================================

describe('checkStock', () => {
  it('13. emails a low-stock alert to staff and the manager when stock crosses the threshold', () => {
    env.addMaterial('m1', { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30 });

    const result = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(result.ok).toBe(true);
    expect(result.sent).toEqual(['low-stock']);
    expect(result.recipients).toBe(3);
    expect(env.sentMail.map((m) => m.to).sort()).toEqual(
      ['gm@example.com', 'juan@example.com', 'maria@example.com']
    );
    expect(env.sentMail[0].subject).toBe('Low-Stock Alert: Mahogany Plank');
  });

  it('13. records every attempt in notification_log', () => {
    env.addMaterial('m1', { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30 });
    env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    const rows = env.logRows();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.materialId).toBe('m1');
      expect(row.triggerType).toBe('low-stock');
      expect(row.channel).toBe('email');
      expect(row.status).toBe('sent');
      expect(row.timestamp).toBeInstanceOf(Date);
    }
  });

  it('13. sends nothing for a repeat within 24 hours', () => {
    env.addMaterial('m1', { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30 });

    env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });
    const mailAfterFirst = env.sentMail.length;

    env.store.materials.m1.stockQuantity = 15;
    const second = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(second.sent).toEqual([]);
    expect(second.skipped).toEqual(['low-stock']);
    expect(env.sentMail).toHaveLength(mailAfterFirst);
  });

  it('sends again once the 24 hours have passed', () => {
    env.addMaterial('m1', { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30 });
    env.store.notification_log.old = {
      materialId: 'm1',
      triggerType: 'low-stock',
      channel: 'email',
      recipientEmail: 'gm@example.com',
      status: 'sent',
      timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000),
    };

    const result = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(result.sent).toEqual(['low-stock']);
  });

  it('does not let a failed attempt suppress the next one', () => {
    env.addMaterial('m1', { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30 });
    env.store.notification_log.failed = {
      materialId: 'm1',
      triggerType: 'low-stock',
      channel: 'email',
      recipientEmail: 'gm@example.com',
      status: 'failed',
      timestamp: new Date(),
    };

    const result = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(result.sent).toEqual(['low-stock']);
  });

  it('13. emails a stock-out alert to the manager only when stock hits zero', () => {
    env.addMaterial('m1', { name: 'Foam Padding Roll', stockQuantity: 0, minThreshold: 5 });

    const result = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(result.sent).toEqual(['low-stock', 'stock-out']);

    const stockOut = env.sentMail.filter((m) => m.subject.startsWith('Stock-Out Alert'));
    expect(stockOut.map((m) => m.to)).toEqual(['gm@example.com']);
  });

  it('sends only the stock-out when the low-stock alert already went out today', () => {
    // The usual sequence: the material went low yesterday afternoon, and
    // this morning it ran out
    env.addMaterial('m1', { name: 'Foam Padding Roll', stockQuantity: 0, minThreshold: 5 });
    env.store.notification_log.earlier = {
      materialId: 'm1',
      triggerType: 'low-stock',
      channel: 'email',
      recipientEmail: 'gm@example.com',
      status: 'sent',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
    };

    const result = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(result.sent).toEqual(['stock-out']);
    expect(result.skipped).toEqual(['low-stock']);
    expect(env.sentMail.map((m) => m.to)).toEqual(['gm@example.com']);
  });

  it('sends nothing for a material above its threshold', () => {
    env.addMaterial('m1', { name: 'Kiln-Dried Narra', stockQuantity: 150, minThreshold: 50 });

    const result = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(result).toEqual({ ok: true, sent: [], skipped: [], recipients: 0 });
    expect(env.sentMail).toHaveLength(0);
  });

  it('reads the quantity from Firestore and ignores any figure in the request', () => {
    // A tampered browser claiming the material is empty, when it is not
    env.addMaterial('m1', { name: 'Kiln-Dried Narra', stockQuantity: 150, minThreshold: 50 });

    const result = env.post({
      action: 'checkStock',
      idToken: staffToken,
      materialId: 'm1',
      stockQuantity: 0,
      minThreshold: 9999,
    });

    expect(result.sent).toEqual([]);
    expect(env.sentMail).toHaveLength(0);
  });

  it('ignores an archived material', () => {
    env.addMaterial('m1', { name: 'Old Stock', stockQuantity: 0, minThreshold: 5, isArchived: true });

    expect(env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' }).sent).toEqual([]);
  });

  it('keeps going when one address fails, and records that one as failed', () => {
    env.addMaterial('m1', { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30 });
    env.failMailTo('maria@example.com');

    const result = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(result.recipients).toBe(2);
    const failed = env.logRows().filter((row) => row.status === 'failed');
    expect(failed.map((row) => row.recipientEmail)).toEqual(['maria@example.com']);
  });

  it('records attempts as failed once the daily mail allowance is spent', () => {
    env.addMaterial('m1', { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30 });
    env.setQuota(0);

    const result = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(result.sent).toEqual([]);
    expect(env.sentMail).toHaveLength(0);
    expect(env.logRows().every((row) => row.status === 'failed')).toBe(true);
  });

  it('releases its lock even when something goes wrong', () => {
    env.addMaterial('m1', { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30 });
    env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    env.failFirestore(500, 'boom');
    env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(env.lock.acquired).toBeGreaterThan(0);
    expect(env.lock.released).toBe(env.lock.acquired);
  });
});

// ============================================================
// WHO MAY ASK
// ============================================================

describe('verifying the caller', () => {
  it('refuses a request with no token', () => {
    const result = env.post({ action: 'checkStock', materialId: 'm1' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('unauthenticated');
  });

  it('refuses a token Google does not recognise', () => {
    const result = env.post({ action: 'checkStock', idToken: 'forged', materialId: 'm1' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('unauthenticated');
  });

  it('refuses a disabled account', () => {
    const token = env.addUser('gone', { email: 'gone@example.com', role: 'production_staff', status: 'disabled' });

    const result = env.post({ action: 'checkStock', idToken: token, materialId: 'm1' });

    expect(result.code).toBe('permission-denied');
  });

  it('refuses a pending account', () => {
    const token = env.addUser('new', { email: 'new@example.com', role: 'production_staff', status: 'pending' });

    expect(env.post({ action: 'checkStock', idToken: token, materialId: 'm1' }).code).toBe('permission-denied');
  });

  it('refuses an unknown action', () => {
    expect(env.post({ action: 'deleteEverything', idToken: gmToken }).ok).toBe(false);
  });

  it('refuses a body that is not JSON', () => {
    const output = env.script.doPost({ postData: { contents: 'not json' } });
    expect(JSON.parse(output.text).ok).toBe(false);
  });

  it('turns a Firestore permission problem into a sentence about setup', () => {
    env.failFirestore(403, { error: { message: 'Missing or insufficient permissions.' } });

    const result = env.post({ action: 'ping', idToken: gmToken });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('setup');
    expect(result.error).toContain('Cloud Datastore User');
  });

  it('names a disabled Firestore API as such', () => {
    env.failFirestore(403, 'Cloud Firestore API has not been used in project 12345 before or it is disabled.');

    const result = env.post({ action: 'ping', idToken: gmToken });

    expect(result.error).toContain('Firestore API is not enabled');
  });
});

describe('the rate limit', () => {
  it('answers thirty calls in the window and refuses the thirty-first', () => {
    env.addMaterial('m1', { name: 'Kiln-Dried Narra', stockQuantity: 150, minThreshold: 50 });

    for (let i = 0; i < 30; i += 1) {
      expect(env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' }).ok).toBe(true);
    }

    const refused = env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe('rate-limited');
  });

  it('counts each person separately', () => {
    env.addMaterial('m1', { name: 'Kiln-Dried Narra', stockQuantity: 150, minThreshold: 50 });

    for (let i = 0; i < 31; i += 1) env.post({ action: 'checkStock', idToken: staffToken, materialId: 'm1' });

    expect(env.post({ action: 'checkStock', idToken: gmToken, materialId: 'm1' }).ok).toBe(true);
  });
});

// ============================================================
// sendChecklist
// ============================================================

describe('sendChecklist', () => {
  beforeEach(() => {
    env.addMaterial('m1', { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30 });
    env.addMaterial('m2', { name: 'Foam Padding Roll', stockQuantity: 0, minThreshold: 5, unit: 'roll' });
    env.addMaterial('m3', { name: 'Kiln-Dried Narra', stockQuantity: 150, minThreshold: 50 });
    env.store.material_costs.m1 = { supplierName: 'Antipolo Hardwood Supply' };
  });

  it('is manager only, as ChecklistController was', () => {
    const result = env.post({ action: 'sendChecklist', idToken: staffToken, recipientUids: ['staff1'] });

    expect(result.code).toBe('permission-denied');
    expect(env.sentMail).toHaveLength(0);
  });

  it('sends the low-stock list to the chosen accounts', () => {
    const result = env.post({ action: 'sendChecklist', idToken: gmToken, recipientUids: ['staff1', 'gm1'] });

    expect(result.ok).toBe(true);
    expect(result.sent).toBe(2);
    expect(result.materialCount).toBe(2);
    expect(env.sentMail[0].subject).toBe('Reorder Checklist - November 1, 2026');
  });

  it('builds the list itself, worst first, leaving healthy materials out', () => {
    env.post({ action: 'sendChecklist', idToken: gmToken, recipientUids: ['gm1'] });
    const text = env.sentMail[0].body;

    expect(text.indexOf('Foam Padding Roll')).toBeLessThan(text.indexOf('Mahogany Plank'));
    expect(text).not.toContain('Kiln-Dried Narra');
    expect(text).toContain('supplier: Antipolo Hardwood Supply');
  });

  it('skips a chosen account that is no longer active', () => {
    const result = env.post({ action: 'sendChecklist', idToken: gmToken, recipientUids: ['gm1', 'off'] });

    expect(result.sent).toBe(1);
    expect(env.sentMail.map((m) => m.to)).toEqual(['gm@example.com']);
  });

  it('adds one outside address, such as a supplier', () => {
    const result = env.post({
      action: 'sendChecklist',
      idToken: gmToken,
      recipientUids: ['gm1'],
      extraEmail: 'orders@supplier.example',
    });

    expect(result.sent).toBe(2);
    expect(env.sentMail.map((m) => m.to)).toContain('orders@supplier.example');
  });

  it('refuses more than one outside address', () => {
    const result = env.post({
      action: 'sendChecklist',
      idToken: gmToken,
      recipientUids: ['gm1'],
      extraEmail: ['a@example.com', 'b@example.com'],
    });

    expect(result.ok).toBe(false);
    expect(env.sentMail).toHaveLength(0);
  });

  it('refuses an outside address that is not an email address', () => {
    const result = env.post({
      action: 'sendChecklist',
      idToken: gmToken,
      recipientUids: [],
      extraEmail: 'a@example.com, b@example.com',
    });

    expect(result.ok).toBe(false);
  });

  it('refuses when nobody was chosen', () => {
    expect(env.post({ action: 'sendChecklist', idToken: gmToken, recipientUids: [] }).ok).toBe(false);
  });

  it('refuses when nothing needs reordering', () => {
    env.store.materials.m1.stockQuantity = 100;
    env.store.materials.m2.stockQuantity = 100;

    const result = env.post({ action: 'sendChecklist', idToken: gmToken, recipientUids: ['gm1'] });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Nothing needs reordering');
  });

  it('sends one copy when an address is chosen and also typed in', () => {
    env.post({
      action: 'sendChecklist',
      idToken: gmToken,
      recipientUids: ['gm1'],
      extraEmail: 'GM@example.com',
    });

    expect(env.sentMail).toHaveLength(1);
  });
});

describe('ping', () => {
  it('tells a manager the sender address and the mail left today', () => {
    const result = env.post({ action: 'ping', idToken: gmToken });

    expect(result).toEqual({
      ok: true,
      sender: 'cornerblock.alerts@gmail.com',
      quotaRemaining: 100,
      firestore: 'reachable',
    });
  });

  it('is refused for staff', () => {
    expect(env.post({ action: 'ping', idToken: staffToken }).code).toBe('permission-denied');
  });
});

// ============================================================
// THE EMAILS, AS READ ON A PHONE
// ============================================================

describe('email templates', () => {
  const material = { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30, unit: 'pcs' };
  const now = new Date();

  it('escapes anything a user typed into a material name', () => {
    const html = env.script.alertEmailHtml(
      { ...material, name: '<img src=x onerror=alert(1)> Plank' },
      'low-stock',
      now
    );

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; Plank');
  });

  it('sets a phone viewport and a single column no wider than a phone', () => {
    const html = env.script.alertEmailHtml(material, 'low-stock', now);

    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(html).toContain('max-width:560px');
    expect(html).not.toMatch(/width="6\d\d"|width:6\d\dpx/);
  });

  it('makes the figure that matters the largest thing in the alert', () => {
    const html = env.script.alertEmailHtml(material, 'low-stock', now);

    expect(html).toContain('font-size:44px');
    expect(html).toContain('>18 <span');
  });

  it('keeps body text large enough to read without zooming', () => {
    const html = env.script.alertEmailHtml(material, 'stock-out', now);
    const sizes = [...html.matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1]));

    // Nothing smaller than 13px, which is the footer and the small badges
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(13);
  });

  it('says out of stock plainly at zero', () => {
    const html = env.script.alertEmailHtml({ ...material, stockQuantity: 0 }, 'stock-out', now);

    expect(html).toContain('OUT OF STOCK');
    expect(html).toContain('cannot be used for production');
  });

  it('lays the checklist out as blocks, with no table of columns', () => {
    const html = env.script.checklistEmailHtml(
      [
        { name: 'Foam Padding Roll', stockQuantity: 0, minThreshold: 5, unit: 'roll' },
        { name: 'Mahogany Plank', stockQuantity: 18, minThreshold: 30, unit: 'pcs', supplierName: 'Antipolo' },
      ],
      now
    );

    // The PHP version's five column table was what forced sideways
    // scrolling on a phone. No header cells means no columns.
    expect(html).not.toContain('<th');
    expect(html).toContain('short by 12');
    expect(html).toContain('Supplier: Antipolo');
    expect(html).toContain('2 materials need reordering');
  });

  it('includes a plain text version of each email', () => {
    const text = env.script.alertEmailText(material, 'low-stock', now);

    expect(text).toContain('LOW-STOCK ALERT');
    expect(text).toContain('In stock now: 18 pcs');
    expect(text).not.toContain('<');
  });

  it('puts a large button in each email back to the system', () => {
    const html = env.script.alertEmailHtml(material, 'low-stock', now);

    expect(html).toContain('https://cornerblock-inventory.web.app/materials?status=low');
    expect(html).toContain('padding:15px 24px');
  });
});
