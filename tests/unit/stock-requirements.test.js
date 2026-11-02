// What a new movement must carry before it can be confirmed
//
// The same requirements firestore.rules enforces (receiptAttachedIfIn,
// projectGivenIfNeeded, notesGivenIfOther), checked in the form so Confirm
// stays off until they are met and nothing the server would refuse is ever
// queued offline. The rules side is in tests/rules/firestore.test.js.

import { describe, it, expect } from 'vitest';

import {
  missingRequirements,
  projectKey,
  projectRequired,
  notesRequired,
} from '../../app-firebase/src/lib/reasons.js';
import { distinctProjects, projectOf } from '../../app-firebase/src/lib/movements.js';
import { filterMaterials } from '../../app-firebase/src/ui/material-picker.js';
import { categoryLabel, signedCount } from '../../app-firebase/src/lib/format.js';

describe('2.1 a stock-in needs its receipt photo', () => {
  it('is missing until a photo is attached', () => {
    expect(missingRequirements({ type: 'in', reason: 'Purchase', hasReceipt: false })).toEqual({
      receipt: 'Attach a photo of the delivery receipt.',
    });
    expect(missingRequirements({ type: 'in', reason: 'Purchase', hasReceipt: true })).toEqual({});
  });

  it('is never asked of a stock-out or an adjustment', () => {
    expect(
      missingRequirements({ type: 'out', reason: 'Project Usage', project: 'Sofa set' }).receipt
    ).toBeUndefined();
    expect(missingRequirements({ type: 'adjust', reason: 'Physical Count' })).toEqual({});
  });
});

describe('2.2 a stock-out needs a project, except when Damaged', () => {
  const message = 'Enter the project these materials are for.';

  it.each(['Project Usage', 'Transfer', 'Other'])('is required for %s', (reason) => {
    expect(projectRequired('out', reason)).toBe(true);
    expect(missingRequirements({ type: 'out', reason, notes: 'long enough' }).project).toBe(message);
  });

  it('is optional for Damaged', () => {
    expect(projectRequired('out', 'Damaged')).toBe(false);
    expect(missingRequirements({ type: 'out', reason: 'Damaged' })).toEqual({});
  });

  it('needs at least 2 characters once trimmed', () => {
    expect(missingRequirements({ type: 'out', reason: 'Transfer', project: '  A  ' }).project).toBe(message);
    expect(missingRequirements({ type: 'out', reason: 'Transfer', project: 'AB' })).toEqual({});
  });

  it('allows at most 100 characters, even when Damaged', () => {
    const long = 'x'.repeat(101);
    expect(missingRequirements({ type: 'out', reason: 'Damaged', project: long }).project).toMatch(/100/);
  });

  it('stores a search key: lowercased, trimmed, single spaces', () => {
    expect(projectKey('  Sofa   Set  for Ms.\tReyes ')).toBe('sofa set for ms. reyes');
    expect(projectKey('')).toBe('');
  });
});

describe('2.3 Other needs notes', () => {
  it('needs at least 5 characters of notes on a stock-out', () => {
    expect(notesRequired('out', 'Other')).toBe(true);
    expect(missingRequirements({ type: 'out', reason: 'Other', project: 'Shop', notes: 'abc' }).notes).toBe(
      'Explain the reason for this stock-out.'
    );
    expect(missingRequirements({ type: 'out', reason: 'Other', project: 'Shop', notes: 'spilled' })).toEqual({});
  });

  it('leaves notes optional for every other reason', () => {
    expect(notesRequired('out', 'Damaged')).toBe(false);
    expect(notesRequired('in', 'Purchase')).toBe(false);
  });
});

describe('project suggestions', () => {
  it('lists each project once, most recent first, matching regardless of case and spacing', () => {
    const movements = [
      { type: 'out', project: 'Sofa set for Ms. Reyes' },
      { type: 'out', project: 'Dining table' },
      { type: 'out', project: 'sofa  set for ms. reyes' },
      { type: 'out', project: '' },
    ];
    expect(distinctProjects(movements)).toEqual(['Sofa set for Ms. Reyes', 'Dining table']);
  });

  it('reads the project of an older stock-out from its reference', () => {
    expect(projectOf({ type: 'out', reference: 'Bed frame' })).toBe('Bed frame');
    expect(projectOf({ type: 'in', reference: 'PO-1042' })).toBe('');
    expect(projectOf({ type: 'out', project: 'New', reference: 'Old' })).toBe('New');
  });
});

describe('2.4 the material picker search', () => {
  const materials = [
    { id: 'a', name: 'Mahogany Plank 1x4' },
    { id: 'b', name: 'Narra Plank 2x2' },
    { id: 'c', name: 'Wood Glue' },
  ];

  it('matches every word typed, in any order and case', () => {
    expect(filterMaterials(materials, 'plank').map((m) => m.id)).toEqual(['a', 'b']);
    expect(filterMaterials(materials, '1X4 mahogany').map((m) => m.id)).toEqual(['a']);
    expect(filterMaterials(materials, '').length).toBe(3);
    expect(filterMaterials(materials, 'teak')).toEqual([]);
  });
});

describe('display formatting', () => {
  it('shows categories in Title Case without changing what was typed', () => {
    expect(categoryLabel('solid wood')).toBe('Solid Wood');
    expect(categoryLabel('adhesives')).toBe('Adhesives');
    expect(categoryLabel('MDF boards')).toBe('MDF Boards');
    expect(categoryLabel('nails/screws')).toBe('Nails/Screws');
    expect(categoryLabel('')).toBe('');
  });

  it('never shows -0', () => {
    expect(signedCount(0, '-')).toBe('0');
    expect(signedCount(-0, '-')).toBe('0');
    expect(signedCount(12, '-')).toBe('-12');
    expect(signedCount(1500, '+')).toBe('+1,500');
  });
});
