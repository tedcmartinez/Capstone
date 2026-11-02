// The audit trail export and its detail view
//
// The CSV and the Google Sheets export share one set of rows, so testing the
// rows tests both. The Sheets requests themselves are checked against a
// stand-in for fetch, since the real API needs a Google account and a
// consent screen that only exist in the live project.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  EXPORT_HEADER,
  exportRows,
  exportTitle,
  exportFileName,
  toCsv,
  csvCell,
  diffRows,
  formatValue,
  actionLabel,
  isKnownAction,
  describeFilters,
  AUDIT_ACTION_GROUPS,
} from '../../app-firebase/src/lib/auditTrail.js';
import {
  createSpreadsheet,
  appendRows,
  formatSheet,
  SheetsDeclined,
  SheetsNotEnabled,
} from '../../app-firebase/src/lib/sheets.js';

// A Firestore Timestamp stand-in, which is all formatTimestamp() reads
const stamp = (iso) => ({ toDate: () => new Date(iso) });

const entry = {
  id: 'log_1',
  action: 'stock.out',
  entity: 'stock_movements',
  entityId: 'mv_1',
  materialId: 'm1',
  actorUid: 'uid_staff',
  actorEmail: 'juan@example.com',
  actorName: 'Juan Dela Cruz',
  actorRole: 'production_staff',
  before: { stockQuantity: 18 },
  after: { stockQuantity: 13 },
  summary: 'Stock out 5 pcs, Mahogany Plank (Project Usage: order #102)',
  timestamp: stamp('2026-11-01T09:30:00+08:00'),
  appVersion: '2.0.0',
};

// ============================================================
// THE ROWS
// ============================================================

describe('export rows', () => {
  it('carries the nine columns the brief asked for, in order', () => {
    expect(EXPORT_HEADER).toEqual([
      'Timestamp', 'User', 'Role', 'Action', 'Entity', 'Record', 'Summary', 'Before', 'After',
    ]);
  });

  it('turns an entry into one row of readable text', () => {
    const [row] = exportRows([entry]);

    expect(row).toHaveLength(9);
    expect(row[1]).toBe('Juan Dela Cruz (juan@example.com)');
    expect(row[2]).toBe('Production Staff');
    expect(row[3]).toBe('Stock out');
    expect(row[4]).toBe('stock_movements');
    expect(row[5]).toBe('mv_1');
    expect(row[6]).toContain('Mahogany Plank');
    expect(row[7]).toBe('Stock quantity: 18');
    expect(row[8]).toBe('Stock quantity: 13');
  });

  it('includes a readable timestamp', () => {
    const [row] = exportRows([entry]);

    expect(row[0]).toMatch(/2026/);
    expect(row[0]).toMatch(/Nov/);
  });

  it('leaves before and after blank for an event that changed nothing', () => {
    const [row] = exportRows([{ ...entry, action: 'auth.login', before: null, after: null }]);

    expect(row[7]).toBe('');
    expect(row[8]).toBe('');
  });

  it('copes with an entry missing its actor details', () => {
    const [row] = exportRows([{ ...entry, actorEmail: null, actorName: null, actorRole: null }]);

    expect(row[1]).toBe('');
    expect(row[2]).toBe('');
  });
});

// ============================================================
// THE TITLE AND FILE NAME
// ============================================================

describe('export title', () => {
  const now = new Date(2026, 10, 1);

  it('follows the brief: Cornerblock Audit Trail — {from} to {to} (exported {date})', () => {
    expect(exportTitle({ dateFrom: '2026-10-01', dateTo: '2026-10-31' }, now)).toBe(
      'Cornerblock Audit Trail — Oct 1, 2026 to Oct 31, 2026 (exported Nov 1, 2026)'
    );
  });

  it('says where it starts when no from date was chosen', () => {
    expect(exportTitle({}, now)).toBe(
      'Cornerblock Audit Trail — earliest record to Nov 1, 2026 (exported Nov 1, 2026)'
    );
  });

  it('gives a downloaded file a plain, date-sortable name', () => {
    const name = exportFileName({ dateFrom: '2026-10-01', dateTo: '2026-10-31' }, now);

    expect(name).toBe('cornerblock-audit-trail_2026-10-01_to_2026-10-31_exported-2026-11-01.csv');
    expect(name).toMatch(/^[a-z0-9_.-]+$/);
  });
});

// ============================================================
// CSV
// ============================================================

describe('csv', () => {
  it('quotes a cell containing a comma, a quote or a line break', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('neutralises a cell that would be read as a formula', () => {
    // Summaries contain text people typed. A note beginning with "=" must
    // not run as a formula when the manager opens the file in Excel.
    expect(csvCell('=HYPERLINK("http://evil.example","click")')).toBe(
      `"'=HYPERLINK(""http://evil.example"",""click"")"`
    );
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-5 pcs')).toBe("'-5 pcs");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('leaves ordinary text alone', () => {
    expect(csvCell('Stock out 5 pcs, Mahogany Plank')).toBe('"Stock out 5 pcs, Mahogany Plank"');
    expect(csvCell('Juan Dela Cruz')).toBe('Juan Dela Cruz');
  });

  it('writes empty cells for missing values', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('starts with a byte order mark so Excel reads it as UTF-8', () => {
    // Without it a peso sign or an accented name arrives garbled
    expect(toCsv([['a']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('separates rows with Windows line endings', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('﻿a,b\r\nc,d');
  });

  it('produces a header and one line per entry', () => {
    const csv = toCsv([EXPORT_HEADER, ...exportRows([entry, entry])]);
    const lines = csv.slice(1).split('\r\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Timestamp,User,Role,Action,Entity,Record,Summary,Before,After');
  });
});

// ============================================================
// THE DETAIL VIEW
// ============================================================

describe('diffRows', () => {
  it('lines up every field from either side', () => {
    const rows = diffRows(
      { name: 'Mahogany Plank', minThreshold: 30 },
      { name: 'Mahogany Plank, Premium', minThreshold: 30 }
    );

    expect(rows.map((r) => r.label)).toEqual(['Name', 'Minimum threshold']);
  });

  it('marks which fields actually changed', () => {
    const rows = diffRows({ minThreshold: 30, unit: 'pcs' }, { minThreshold: 40, unit: 'pcs' });

    expect(rows.find((r) => r.field === 'minThreshold').changed).toBe(true);
    expect(rows.find((r) => r.field === 'unit').changed).toBe(false);
  });

  it('shows a field that only exists on one side', () => {
    const rows = diffRows(null, { name: 'Contact Adhesive', unit: 'can' });

    expect(rows).toHaveLength(2);
    expect(rows[0].before).toBe('(none)');
    expect(rows[0].changed).toBe(true);
  });

  it('returns nothing for an event with no before or after', () => {
    expect(diffRows(null, null)).toEqual([]);
  });
});

describe('formatValue', () => {
  it('writes values the way a person would say them', () => {
    expect(formatValue(true)).toBe('Yes');
    expect(formatValue(false)).toBe('No');
    expect(formatValue(null)).toBe('(none)');
    expect(formatValue('')).toBe('(none)');
    expect(formatValue('general_manager', 'role')).toBe('General Manager');
    expect(formatValue(350, 'costPerUnit')).toBe('PHP 350.00');
  });

  it('writes out a nested object, such as the filters on an export', () => {
    expect(formatValue({ from: '2026-10-01', user: 'Juan' })).toBe('from: 2026-10-01; user: Juan');
  });
});

// ============================================================
// ACTIONS
// ============================================================

describe('actions', () => {
  it('names every action the brief lists', () => {
    const expected = [
      'material.create', 'material.update', 'material.archive', 'material_cost.update',
      'supplier.create', 'supplier.update', 'supplier.archive',
      'stock.in', 'stock.out', 'stock.adjust',
      'user.register', 'user.approve', 'user.reject', 'user.role_change', 'user.disable',
      'auth.login', 'auth.logout', 'audit.export', 'checklist.send', 'data.migrate',
    ];

    for (const action of expected) {
      expect(isKnownAction(action)).toBe(true);
      expect(actionLabel(action)).not.toBe(action);
    }
  });

  it('falls back to the stored code for something unrecognised', () => {
    expect(actionLabel('something.new')).toBe('something.new');
    expect(isKnownAction('something.new')).toBe(false);
  });

  it('lists each action in exactly one group', () => {
    const all = AUDIT_ACTION_GROUPS.flatMap((group) => Object.keys(group.actions));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('describeFilters', () => {
  it('records the filters in names a person can read, not ids', () => {
    const described = describeFilters(
      { dateFrom: '2026-10-01', actorUid: 'u1', action: 'stock.out', materialId: 'm1' },
      {
        users: [{ id: 'u1', name: 'Juan Dela Cruz', email: 'juan@example.com' }],
        materials: [{ id: 'm1', name: 'Mahogany Plank' }],
      }
    );

    expect(described).toEqual({
      from: '2026-10-01',
      user: 'Juan Dela Cruz (juan@example.com)',
      action: 'Stock out',
      material: 'Mahogany Plank',
    });
  });

  it('is empty when nothing was filtered', () => {
    expect(describeFilters({})).toEqual({});
  });
});

// ============================================================
// THE SHEETS REQUESTS
// ============================================================

describe('google sheets requests', () => {
  let calls;

  function respondWith(...responses) {
    calls = [];
    let index = 0;
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return {
        ok: response.status < 400,
        status: response.status,
        json: async () => response.body,
      };
    });
  }

  beforeEach(() => {
    calls = [];
  });

  it('creates the spreadsheet with the header row frozen', async () => {
    respondWith({
      status: 200,
      body: {
        spreadsheetId: 'sheet_1',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_1',
        sheets: [{ properties: { sheetId: 0 } }],
      },
    });

    const sheet = await createSpreadsheet('token_abc', 'Cornerblock Audit Trail');

    expect(sheet.spreadsheetId).toBe('sheet_1');
    expect(calls[0].headers.Authorization).toBe('Bearer token_abc');
    expect(calls[0].body.properties.title).toBe('Cornerblock Audit Trail');
    expect(calls[0].body.sheets[0].properties.gridProperties.frozenRowCount).toBe(1);
  });

  it('writes values as raw text, so nothing typed can run as a formula', async () => {
    respondWith({ status: 200, body: {} });

    await appendRows('token_abc', 'sheet_1', [['=1+1']]);

    expect(calls[0].url).toContain('valueInputOption=RAW');
    expect(calls[0].url).not.toContain('USER_ENTERED');
  });

  it('sends a large export in batches rather than one huge request', async () => {
    respondWith({ status: 200, body: {} });

    const rows = Array.from({ length: 4500 }, (_, i) => [`row ${i}`]);
    await appendRows('token_abc', 'sheet_1', rows);

    expect(calls).toHaveLength(3);
    expect(calls.reduce((sum, call) => sum + call.body.values.length, 0)).toBe(4500);
  });

  it('bolds the header and sizes the columns to their contents', async () => {
    respondWith({ status: 200, body: {} });

    await formatSheet('token_abc', 'sheet_1', 0, 9);

    const [bold, resize] = calls[0].body.requests;
    expect(bold.repeatCell.cell.userEnteredFormat.textFormat.bold).toBe(true);
    expect(resize.autoResizeDimensions.dimensions.endIndex).toBe(9);
  });

  it('reports a switched-off Sheets API as a setup problem', async () => {
    // What happens until the API is enabled for the project
    respondWith({
      status: 403,
      body: {
        error: {
          message: 'Google Sheets API has not been used in project 281463397004 before or it is disabled.',
          details: [{ reason: 'SERVICE_DISABLED' }],
        },
      },
    });

    await expect(createSpreadsheet('token_abc', 'title')).rejects.toBeInstanceOf(SheetsNotEnabled);
  });

  it('treats a missing Drive permission as declined, so the CSV is offered', async () => {
    // Google lets a person untick the Drive permission on the consent
    // screen, and this is what that looks like from here
    respondWith({
      status: 403,
      body: { error: { message: 'Request had insufficient authentication scopes.' } },
    });

    await expect(createSpreadsheet('token_abc', 'title')).rejects.toBeInstanceOf(SheetsDeclined);
  });
});
