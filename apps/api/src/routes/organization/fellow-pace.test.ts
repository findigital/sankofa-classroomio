import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Context, Next } from 'hono';

import { Hono } from '@api/utils/hono';
import { ErrorCodes } from '@api/utils/errors';
import { ROLE } from '@cio/utils/constants';

import { fellowPaceRouter } from './fellow-pace';

const mocks = vi.hoisted(() => ({
  getFellowPace: vi.fn(),
  getMentorRoster: vi.fn(),
  setMentorFellows: vi.fn(),
  readMinorFlag: vi.fn(),
  readSafeguarding: vi.fn(),
  updateSafeguarding: vi.fn()
}));

vi.mock('@api/services/organization/fellow-pace', () => ({
  getFellowPace: mocks.getFellowPace
}));

vi.mock('@api/services/organization/mentor-assignment', () => ({
  getMentorRoster: mocks.getMentorRoster,
  setMentorFellows: mocks.setMentorFellows
}));

vi.mock('@api/services/organization/safeguarding', () => ({
  readMinorFlag: mocks.readMinorFlag,
  readSafeguarding: mocks.readSafeguarding,
  updateSafeguarding: mocks.updateSafeguarding
}));

const ORG_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const USER_ID = 'b2f0a5d4-8c1e-4a6b-9d3f-2e7c8a1b4d5e';

function buildApp(roleId: number) {
  const setContext = async (c: Context, next: Next) => {
    c.set('user', { id: USER_ID } as never);
    c.set('session', { id: 'session' } as never);
    c.set('orgRoles', { [ORG_ID]: roleId });
    await next();
  };

  return new Hono().use(setContext).route('/organization/fellows', fellowPaceRouter);
}

async function bodyOf(response: Response) {
  return response.json() as Promise<{ success: boolean; code?: string }>;
}

describe('fellow pace routes deny the wrong role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a fellow reading pace, the minor flag, and the safeguarding record', async () => {
    const app = buildApp(ROLE.STUDENT);
    const headers = { 'cio-org-id': ORG_ID };

    const pace = await app.request('/organization/fellows/pace', { headers });
    const minor = await app.request('/organization/fellows/12/minor', { headers });
    const safeguarding = await app.request('/organization/fellows/12/safeguarding', { headers });

    expect(pace.status).toBe(403);
    expect(minor.status).toBe(403);
    expect(safeguarding.status).toBe(403);
    expect((await bodyOf(pace)).code).toBe(ErrorCodes.ORG_TEAM_NOT_AUTHORIZED);
    expect((await bodyOf(minor)).code).toBe(ErrorCodes.ORG_TEAM_NOT_AUTHORIZED);
    expect((await bodyOf(safeguarding)).code).toBe(ErrorCodes.ORG_TEAM_NOT_AUTHORIZED);
    expect(mocks.getFellowPace).not.toHaveBeenCalled();
    expect(mocks.readMinorFlag).not.toHaveBeenCalled();
    expect(mocks.readSafeguarding).not.toHaveBeenCalled();
  });

  it('rejects a tutor editing consent', async () => {
    const app = buildApp(ROLE.TUTOR);
    const response = await app.request('/organization/fellows/12/safeguarding', {
      method: 'PUT',
      headers: { 'cio-org-id': ORG_ID, 'content-type': 'application/json' },
      body: JSON.stringify({ isMinor: true })
    });

    expect(response.status).toBe(403);
    expect((await bodyOf(response)).code).toBe(ErrorCodes.ORG_TEAM_NOT_AUTHORIZED);
    expect(mocks.updateSafeguarding).not.toHaveBeenCalled();
  });
});
