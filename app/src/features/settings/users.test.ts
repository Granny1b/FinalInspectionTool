import type { Person } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  addPerson,
  checkPerson,
  filterPeople,
  invitation,
  invitationMailto,
  isListed,
  listIssue,
  removePerson,
  sortPeople,
  toInput,
  updatePerson,
} from './users';

const person = (email: string, name: string, role: Person['role'] = 'inspector'): Person => ({
  email,
  name,
  role,
  addedAt: '2026-10-01T08:00:00.000Z',
  addedBy: 'boss@modig.se',
});

const boss = person('boss@modig.se', 'Birgitta Boss', 'admin');
const sam = person('sam.andersson@modig.se', 'Sam Andersson');
const asa = person('asa.oberg@modig.se', 'Åsa Öberg');
const people = [sam, asa, boss];

describe('the list', () => {
  it('sends only email, name and role', () => {
    expect(toInput([boss])).toEqual([
      { email: 'boss@modig.se', name: 'Birgitta Boss', role: 'admin' },
    ]);
  });

  it('sorts by name, Å after Z', () => {
    expect(sortPeople(people).map((p) => p.name)).toEqual([
      'Birgitta Boss',
      'Sam Andersson',
      'Åsa Öberg',
    ]);
  });

  it('finds people by part of their name or email, ignoring case', () => {
    expect(filterPeople(people, 'ÅSA')).toEqual([asa]);
    expect(filterPeople(people, ' andersson@ ')).toEqual([sam]);
    expect(filterPeople(people, '')).toEqual(people);
    expect(filterPeople(people, 'nobody')).toEqual([]);
  });

  it('knows who is on it, however the email is typed', () => {
    expect(isListed(people, ' Boss@Modig.se')).toBe(true);
    expect(isListed(people, 'guest@outlook.com')).toBe(false);
  });

  it('adds, updates and removes one person, leaving the others as they were', () => {
    const erik = { email: 'erik.lund@modig.se', name: 'Erik Lund', role: 'inspector' } as const;
    expect(addPerson([boss], erik)).toEqual([...toInput([boss]), erik]);
    expect(updatePerson(people, sam.email, { name: 'Samuel', role: 'admin' })).toEqual([
      { email: sam.email, name: 'Samuel', role: 'admin' },
      ...toInput([asa, boss]),
    ]);
    expect(removePerson(people, asa.email)).toEqual(toInput([sam, boss]));
  });

  it('needs an admin once anyone is on it', () => {
    expect(listIssue(toInput([sam, asa]))).toMatch(/at least one admin/);
    expect(listIssue(toInput([sam, boss]))).toBeNull();
    expect(listIssue([])).toBeNull();
  });
});

describe('checkPerson', () => {
  it('cleans up the typed-in person as the API stores it', () => {
    const result = checkPerson(
      { name: '  Erik Lund ', email: ' Erik.Lund@Modig.se ', role: 'admin' },
      people,
    );
    expect(result).toEqual({
      person: { name: 'Erik Lund', email: 'erik.lund@modig.se', role: 'admin' },
      errors: null,
    });
  });

  it('asks for a name and a real email', () => {
    expect(checkPerson({ name: ' ', email: 'erik', role: 'inspector' }, people)).toEqual({
      person: null,
      errors: {
        name: 'Enter their name.',
        email: 'Enter an email address, like name@modig.se.',
      },
    });
  });

  it('refuses an email that is already on the list', () => {
    const result = checkPerson(
      { name: 'Sam', email: 'SAM.andersson@modig.se', role: 'admin' },
      people,
    );
    expect(result.errors).toEqual({ email: 'sam.andersson@modig.se is already on the list.' });
  });
});

describe('invitation', () => {
  const erik = { email: 'erik.lund@modig.se', name: 'Erik Lund', role: 'inspector' } as const;

  it("has the app's address and the Microsoft account to sign in with", () => {
    expect(invitation(erik, 'https://inspection.modig.se/')).toEqual({
      subject: 'Your access to Modig Final Inspection',
      body: [
        'Hi Erik,',
        '',
        'You now have access to Modig Final Inspection as an inspector.',
        '',
        'Open https://inspection.modig.se/ and sign in with your Microsoft account erik.lund@modig.se.',
      ].join('\n'),
    });
    expect(invitation({ ...erik, role: 'admin' }, 'https://x/').body).toContain('as an admin.');
  });

  it('opens in an email program addressed to them, with the text filled in', () => {
    const href = invitationMailto(erik.email, { subject: 'Hi & welcome', body: 'Line 1\nLine 2' });
    expect(href).toBe(
      'mailto:erik.lund@modig.se?subject=Hi%20%26%20welcome&body=Line%201%0ALine%202',
    );
    const url = new URL(href);
    expect(url.searchParams.get('body')).toBe('Line 1\nLine 2');
  });
});
