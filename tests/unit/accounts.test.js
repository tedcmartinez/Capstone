// Which buttons the Users page offers
//
// accountActions() decides what is drawn. The rules tests in
// tests/rules/firestore.test.js prove what the server allows. These cases
// are the same ones, so the page can never offer a button the server would
// refuse, or hide one it would allow.

import { describe, it, expect } from 'vitest';

import { accountActions, roleAfter } from '../../app-firebase/src/lib/accounts.js';

const webmaster = { uid: 'wm', role: 'webmaster', status: 'active' };
const manager = { uid: 'gm', role: 'general_manager', status: 'active' };
const staff = { uid: 'st', role: 'production_staff', status: 'active' };

const account = (id, role, status = 'active') => ({ id, role, status });

// The buttons offered, as a sorted list, for readable comparisons
function offered(viewer, target) {
  const actions = accountActions(viewer, target);
  return ['approve', 'reject', 'disable', 'enable', 'promote', 'demote'].filter((a) => actions[a]);
}

describe('a manager looking at other accounts', () => {
  it('8. may disable another manager', () => {
    expect(offered(manager, account('gm2', 'general_manager'))).toEqual(['disable', 'demote']);
  });

  it('8. may re-enable a disabled manager, and demote them', () => {
    expect(offered(manager, account('gm2', 'general_manager', 'disabled'))).toEqual(['enable', 'demote']);
  });

  it('8. is never offered promotion of staff', () => {
    expect(offered(manager, account('s1', 'production_staff'))).toEqual(['disable']);
    expect(accountActions(manager, account('s1', 'production_staff')).promote).toBe(false);
  });

  it('may approve or reject a pending account, but not promote it', () => {
    expect(offered(manager, account('new', 'production_staff', 'pending'))).toEqual(['approve', 'reject']);
  });

  it('9. is offered nothing on the webmaster', () => {
    const actions = accountActions(manager, account('wm', 'webmaster'));

    expect(offered(manager, account('wm', 'webmaster'))).toEqual([]);
    expect(actions.reason).toBe('Cannot be changed');
  });
});

describe('the webmaster looking at other accounts', () => {
  it('8. may promote staff to manager', () => {
    expect(offered(webmaster, account('s1', 'production_staff'))).toEqual(['disable', 'promote']);
  });

  it('may demote a manager', () => {
    expect(offered(webmaster, account('gm', 'general_manager'))).toEqual(['disable', 'demote']);
  });

  it('may approve a pending account, and promote only once approved', () => {
    expect(offered(webmaster, account('new', 'production_staff', 'pending'))).toEqual(['approve', 'reject']);
  });

  it('may re-enable any disabled account', () => {
    expect(offered(webmaster, account('s1', 'production_staff', 'disabled'))).toEqual(['enable', 'promote']);
  });
});

describe('nobody is offered anything on their own account', () => {
  it('a manager', () => {
    const actions = accountActions(manager, account('gm', 'general_manager'));

    expect(offered(manager, account('gm', 'general_manager'))).toEqual([]);
    expect(actions.reason).toBe('Your own account');
  });

  it('the webmaster', () => {
    // Its own account is both its own and the webmaster's; either reason
    // stops every button
    expect(offered(webmaster, account('wm', 'webmaster'))).toEqual([]);
  });
});

describe('a viewer who is not a manager', () => {
  it('staff are offered nothing on anyone', () => {
    expect(offered(staff, account('s2', 'production_staff'))).toEqual([]);
    expect(offered(staff, account('gm', 'general_manager'))).toEqual([]);
  });

  it('a disabled manager is offered nothing', () => {
    const disabledManager = { ...manager, status: 'disabled' };

    expect(offered(disabledManager, account('s1', 'production_staff'))).toEqual([]);
  });

  it('copes with nobody signed in', () => {
    expect(offered(null, account('s1', 'production_staff'))).toEqual([]);
  });
});

describe('roleAfter', () => {
  it('names the role each change leads to', () => {
    expect(roleAfter('promote')).toBe('general_manager');
    expect(roleAfter('demote')).toBe('production_staff');
  });
});
