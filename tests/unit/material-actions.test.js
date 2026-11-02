// Who is offered Adjust Stock in the catalog
//
// Adjust Stock is a manager decision: it overrides the stock figure with a
// counted one. It appears in two places, the row menu and the Edit Material
// modal, and must appear in both for a general manager and for the
// webmaster, and in neither for production staff.
//
// The page decides with isManager(), which these tests run for each role
// exactly as the page does, before rendering the row and the modal. The
// rules decide separately, in firestore.rules, and refuse an adjustment
// from staff whatever the page draws: that is covered in
// tests/integration/stale-write.test.js and tests/rules/firestore.test.js.

import { describe, it, expect, beforeEach } from 'vitest';

import { row, materialModal } from '../../app-firebase/src/pages/materials.js';
import { setCurrentUser, clearCurrentUser, isManager } from '../../app-firebase/src/lib/session.js';

const material = {
  id: 'm1',
  name: 'Mahogany Plank',
  category: 'wood',
  size: '1x4x8ft',
  unit: 'pcs',
  stockQuantity: 18,
  minThreshold: 30,
  costPerUnit: 220,
  supplierName: 'Antipolo Hardwood Supply',
};

function signInAs(role) {
  setCurrentUser({ uid: `uid_${role}`, email: `${role}@example.com`, name: role, role, status: 'active' });
}

// What the page draws for whoever is signed in
const rowFor = () => row(material, isManager());
const modalFor = () => materialModal(isManager(), ['wood']);

beforeEach(() => clearCurrentUser());

describe.each([
  ['general_manager', 'a general manager'],
  ['webmaster', 'the webmaster'],
])('%s', (role, who) => {
  beforeEach(() => signInAs(role));

  it(`offers ${who} Adjust Stock from the catalog row`, () => {
    expect(rowFor()).toContain('data-adjust="m1"');
  });

  it(`offers ${who} Adjust Stock from the Edit Material modal`, () => {
    expect(modalFor()).toContain('id="cbMaterialAdjust"');
  });

  it(`also offers ${who} Edit and Archive, and the cost columns`, () => {
    const html = rowFor();

    expect(html).toContain('data-edit="m1"');
    expect(html).toContain('data-archive="m1"');
    expect(html).toContain('PHP 220.00');
  });
});

describe('production staff', () => {
  beforeEach(() => signInAs('production_staff'));

  it('are not offered Adjust Stock in the catalog row', () => {
    expect(rowFor()).not.toContain('data-adjust');
    expect(rowFor()).not.toContain('Adjust Stock');
  });

  it('are not offered Adjust Stock in the Add Material modal', () => {
    // Staff only ever open this modal to add a material, but the button is
    // left out of their copy of it entirely, not just hidden
    expect(modalFor()).not.toContain('cbMaterialAdjust');
  });

  it('are not offered Edit or Archive, and see no cost or supplier', () => {
    const html = rowFor();

    expect(html).not.toContain('data-edit');
    expect(html).not.toContain('data-archive');
    expect(html).not.toContain('PHP 220.00');
    expect(html).not.toContain('Antipolo Hardwood Supply');
  });

  it('are still offered Stock In and Stock Out', () => {
    const html = rowFor();

    expect(html).toContain('data-move="in"');
    expect(html).toContain('data-move="out"');
  });
});

describe('a manager whose account is disabled', () => {
  it('is treated as nobody, and offered no manager actions', () => {
    setCurrentUser({ uid: 'gm', email: 'gm@example.com', name: 'GM', role: 'general_manager', status: 'disabled' });

    expect(rowFor()).not.toContain('data-adjust');
  });
});
