import { describe, expect, it } from 'vitest';

import { presenceChannelFilter, unreadInListedChannels } from './presence';

describe('messaging presence channel scope', () => {
  it('queries only the API-allowed channels', () => {
    expect(presenceChannelFilter('me', 'org-1', ['cohort_discussion:dis1', 'mentor_dm:mdm'])).toEqual({
      cid: { $in: ['cohort_discussion:dis1', 'mentor_dm:mdm'] },
      members: { $in: ['me'] },
      organization_id: 'org-1'
    });
    expect(presenceChannelFilter('me', 'org-1', []).cid).toEqual({ $in: ['none'] });
  });

  it('ignores unread messages on channels the API did not list', () => {
    const allowed = new Set(['cohort_discussion:dis1']);
    const channels = [
      {
        cid: 'cohort_discussion:dis1',
        data: { organization_id: 'org-1' },
        countUnread: () => 2
      },
      {
        cid: 'cohort_discussion:hidden',
        data: { organization_id: 'org-1' },
        countUnread: () => 9
      },
      {
        cid: 'cohort_discussion:dis1',
        data: { organization_id: 'other-org' },
        countUnread: () => 4
      }
    ];

    expect(unreadInListedChannels(channels, allowed, 'org-1')).toBe(2);
    expect(unreadInListedChannels(channels, new Set(), 'org-1')).toBe(0);
  });
});
