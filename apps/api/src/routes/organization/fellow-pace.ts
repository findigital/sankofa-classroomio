import { zValidator } from '@hono/zod-validator';

import { authMiddleware } from '@api/middlewares/auth';
import { orgAdminMiddleware } from '@api/middlewares/org-admin';
import { orgTeamMemberMiddleware } from '@api/middlewares/org-team-member';
import { getFellowPace } from '@api/services/organization/fellow-pace';
import { getMentorRoster, setMentorFellows } from '@api/services/organization/mentor-assignment';
import { readMinorFlag, readSafeguarding, updateSafeguarding } from '@api/services/organization/safeguarding';
import { handleError } from '@api/utils/errors';
import { Hono } from '@api/utils/hono';
import { ROLE } from '@cio/utils/constants';
import {
  ZFellowMemberParam,
  ZFellowPaceQuery,
  ZMentorProfileParam,
  ZReplaceMentorFellows,
  ZUpdateSafeguarding
} from '@cio/utils/validation/organization';

export const fellowPaceRouter = new Hono()
  .get('/pace', authMiddleware, orgTeamMemberMiddleware, zValidator('query', ZFellowPaceQuery), async (c) => {
    try {
      const user = c.get('user')!;
      const orgId = c.req.header('cio-org-id')!;
      const orgRoles = c.get('orgRoles') ?? {};
      const data = await getFellowPace(
        orgId,
        { profileId: user.id, roleId: orgRoles[orgId] ?? ROLE.STUDENT },
        c.req.valid('query')
      );

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to load fellow pace');
    }
  })
  .get('/mentors', authMiddleware, orgTeamMemberMiddleware, async (c) => {
    try {
      const user = c.get('user')!;
      const orgId = c.req.header('cio-org-id')!;
      const orgRoles = c.get('orgRoles') ?? {};
      const data = await getMentorRoster(orgId, {
        profileId: user.id,
        roleId: orgRoles[orgId] ?? ROLE.STUDENT
      });

      return c.json({ success: true, data }, 200);
    } catch (error) {
      return handleError(c, error, 'Failed to load mentor assignments');
    }
  })
  .put(
    '/mentors/:mentorProfileId',
    authMiddleware,
    orgAdminMiddleware,
    zValidator('param', ZMentorProfileParam),
    zValidator('json', ZReplaceMentorFellows),
    async (c) => {
      try {
        const user = c.get('user')!;
        const orgId = c.req.header('cio-org-id')!;
        const { mentorProfileId } = c.req.valid('param');
        const { fellowProfileIds } = c.req.valid('json');
        const data = await setMentorFellows(orgId, mentorProfileId, fellowProfileIds, {
          profileId: user.id,
          roleId: ROLE.ADMIN
        });

        return c.json({ success: true, data }, 200);
      } catch (error) {
        return handleError(c, error, 'Failed to save mentor assignments');
      }
    }
  )
  .get(
    '/:memberId/minor',
    authMiddleware,
    orgTeamMemberMiddleware,
    zValidator('param', ZFellowMemberParam),
    async (c) => {
      try {
        const user = c.get('user')!;
        const orgId = c.req.header('cio-org-id')!;
        const orgRoles = c.get('orgRoles') ?? {};
        const { memberId } = c.req.valid('param');
        const data = await readMinorFlag(orgId, memberId, {
          profileId: user.id,
          roleId: orgRoles[orgId] ?? ROLE.STUDENT
        });

        return c.json({ success: true, data }, 200);
      } catch (error) {
        return handleError(c, error, 'Failed to load fellow flag');
      }
    }
  )
  .get(
    '/:memberId/safeguarding',
    authMiddleware,
    orgAdminMiddleware,
    zValidator('param', ZFellowMemberParam),
    async (c) => {
      try {
        const user = c.get('user')!;
        const orgId = c.req.header('cio-org-id')!;
        const { memberId } = c.req.valid('param');
        const data = await readSafeguarding(orgId, memberId, { profileId: user.id, roleId: ROLE.ADMIN });

        return c.json({ success: true, data }, 200);
      } catch (error) {
        return handleError(c, error, 'Failed to load safeguarding record');
      }
    }
  )
  .put(
    '/:memberId/safeguarding',
    authMiddleware,
    orgAdminMiddleware,
    zValidator('param', ZFellowMemberParam),
    zValidator('json', ZUpdateSafeguarding),
    async (c) => {
      try {
        const user = c.get('user')!;
        const orgId = c.req.header('cio-org-id')!;
        const { memberId } = c.req.valid('param');
        const data = await updateSafeguarding(
          orgId,
          memberId,
          { profileId: user.id, roleId: ROLE.ADMIN },
          c.req.valid('json')
        );

        return c.json({ success: true, data }, 200);
      } catch (error) {
        return handleError(c, error, 'Failed to save safeguarding record');
      }
    }
  );
