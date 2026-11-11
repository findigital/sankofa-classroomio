import { describe, expect, it } from 'vitest';

import { profileDisplayName } from './profile-display-name';

describe('profileDisplayName', () => {
  it('prefers a full name over a username', () => {
    expect(profileDisplayName({ fullname: 'Amara Okonkwo', username: 'amara.okonkwo' })).toBe('Amara Okonkwo');
  });

  it('falls back to the username when the full name is blank', () => {
    expect(profileDisplayName({ fullname: '   ', username: 'amara.okonkwo' })).toBe('amara.okonkwo');
    expect(profileDisplayName({ fullname: null, username: 'amara.okonkwo' })).toBe('amara.okonkwo');
  });

  it('returns an empty string when neither name is present', () => {
    expect(profileDisplayName(null)).toBe('');
    expect(profileDisplayName({ fullname: '', username: '  ' })).toBe('');
  });
});
