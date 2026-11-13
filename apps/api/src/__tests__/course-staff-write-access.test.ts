import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isCourseTeamMemberOrOrgAdmin: vi.fn(async () => false),
  canProfileOpenCourse: vi.fn(async () => true)
}));

vi.mock('@api/middlewares/auth', () => ({
  authMiddleware: async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('user', { id: 'student-1' });
    c.set('session', { id: 'session-1' });
    await next();
  }
}));

vi.mock('@api/middlewares/auth-or-automation-key', () => ({
  authOrAutomationKeyMiddleware: async (
    c: { set: (key: string, value: unknown) => void },
    next: () => Promise<void>
  ) => {
    c.set('user', { id: 'student-1' });
    c.set('session', { id: 'session-1' });
    await next();
  }
}));

vi.mock('@cio/db/queries/group', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cio/db/queries/group')>();
  return {
    ...actual,
    isCourseTeamMemberOrOrgAdmin: mocks.isCourseTeamMemberOrOrgAdmin
  };
});

vi.mock('@api/services/course/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@api/services/course/access')>();
  return {
    ...actual,
    canProfileOpenCourse: mocks.canProfileOpenCourse
  };
});

import { courseRouter } from '@api/routes/course/course';
import { Hono } from '@api/utils/hono';

const app = new Hono().route('/course', courseRouter);

const jsonHeaders = { 'content-type': 'application/json' };

describe('course staff write access', () => {
  beforeEach(() => {
    mocks.isCourseTeamMemberOrOrgAdmin.mockReset();
    mocks.isCourseTeamMemberOrOrgAdmin.mockResolvedValue(false);
    mocks.canProfileOpenCourse.mockReset();
    mocks.canProfileOpenCourse.mockResolvedValue(true);
  });

  it('rejects a student on staff-only course writes', async () => {
    const requests: Array<[string, RequestInit]> = [
      ['/course/course-1', { method: 'PUT', headers: jsonHeaders, body: '{}' }],
      ['/course/course-1/lesson', { method: 'POST', headers: jsonHeaders, body: '{}' }],
      ['/course/course-1/lesson/lesson-1', { method: 'PUT', headers: jsonHeaders, body: '{}' }],
      ['/course/course-1/lesson/lesson-1', { method: 'DELETE' }],
      ['/course/course-1/section', { method: 'POST', headers: jsonHeaders, body: '{}' }],
      ['/course/course-1/section/section-1', { method: 'PUT', headers: jsonHeaders, body: '{}' }],
      ['/course/course-1/section/section-1', { method: 'DELETE' }],
      ['/course/course-1/exercise', { method: 'POST', headers: jsonHeaders, body: '{}' }],
      ['/course/course-1/exercise/exercise-1', { method: 'PUT', headers: jsonHeaders, body: '{}' }],
      ['/course/course-1/exercise/exercise-1', { method: 'DELETE' }],
      ['/course/course-1/lesson/lesson-1/language', { method: 'POST', headers: jsonHeaders, body: '{}' }]
    ];

    for (const [path, init] of requests) {
      const response = await app.request(path, init);
      expect(response.status, path).toBe(403);
    }
  });

  it('lets a tutor through the settings update gate', async () => {
    mocks.isCourseTeamMemberOrOrgAdmin.mockResolvedValue(true);

    const response = await app.request('/course/course-1', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ title: 123 })
    });

    expect(response.status).toBe(400);
  });

  it('still lets a student open the exercise submission route', async () => {
    const response = await app.request('/course/course-1/exercise/exercise-1/submission', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{}'
    });

    expect(response.status).not.toBe(403);
    expect(mocks.canProfileOpenCourse).toHaveBeenCalled();
  });
});
