import { BaseApiWithErrors, classroomio } from '$lib/utils/services/api';
import { ZReplaceMentorFellows, ZUpdateSafeguarding } from '@cio/utils/validation/organization';
import type { TReplaceMentorFellows, TUpdateSafeguarding } from '@cio/utils/validation/organization';
import { snackbar } from '$features/ui/snackbar/store';

import type {
  FellowPaceFellow,
  FellowPaceQuery,
  GetFellowPaceRequest,
  GetMentorRosterRequest,
  GetSafeguardingRequest,
  MentorRosterData,
  PaceCohortOption,
  PaceCourseOption,
  ReplaceMentorFellowsRequest,
  SafeguardingView,
  UpdateSafeguardingRequest
} from '../utils/types';

class PaceApi extends BaseApiWithErrors {
  fellows = $state<FellowPaceFellow[] | null>(null);
  quietDays = $state(14);
  courses = $state<PaceCourseOption[]>([]);
  cohorts = $state<PaceCohortOption[]>([]);
  roster = $state<MentorRosterData | null>(null);
  safeguarding = $state<SafeguardingView | null>(null);
  private paceRequest = 0;

  async loadPace(query: FellowPaceQuery = {}) {
    const requestId = ++this.paceRequest;
    const requestQuery: Record<string, string> = {};

    if (query.cohortId) requestQuery.cohortId = query.cohortId;
    if (query.courseId) requestQuery.courseId = query.courseId;
    if (query.quietDays) requestQuery.quietDays = String(query.quietDays);

    return this.execute<GetFellowPaceRequest>({
      requestFn: () => classroomio.organization.fellows.pace.$get({ query: requestQuery }),
      logContext: 'loading fellow pace',
      onSuccess: (response) => {
        if (requestId !== this.paceRequest) return;

        this.fellows = response.data.fellows;
        this.quietDays = response.data.quietDays;
        this.courses = response.data.courses;
        this.cohorts = response.data.cohorts;
      },
      onError: () => {
        if (requestId !== this.paceRequest) return;
        if (this.fellows === null) this.fellows = [];

        snackbar.error('snackbar.pace.load_failed');
      }
    });
  }

  async loadMentors() {
    return this.execute<GetMentorRosterRequest>({
      requestFn: () => classroomio.organization.fellows.mentors.$get(),
      logContext: 'loading mentor assignments',
      onSuccess: (response) => {
        this.roster = response.data;
      },
      onError: () => {
        snackbar.error('snackbar.pace.load_failed');
      }
    });
  }

  async saveMentors(mentorProfileId: string, fields: TReplaceMentorFellows) {
    const parsed = ZReplaceMentorFellows.safeParse(fields);

    if (!parsed.success) {
      snackbar.error('snackbar.pace.save_failed');
      return;
    }

    return this.execute<ReplaceMentorFellowsRequest>({
      requestFn: () =>
        classroomio.organization.fellows.mentors[':mentorProfileId'].$put({
          param: { mentorProfileId },
          json: parsed.data
        }),
      logContext: 'saving mentor assignments',
      onSuccess: () => {
        snackbar.success('snackbar.pace.mentors_saved');
      },
      onError: () => {
        snackbar.error('snackbar.pace.save_failed');
      }
    });
  }

  async loadSafeguarding(memberId: number, options: { keepCurrent?: boolean } = {}) {
    if (!options.keepCurrent) this.safeguarding = null;

    return this.execute<GetSafeguardingRequest>({
      requestFn: () =>
        classroomio.organization.fellows[':memberId'].safeguarding.$get({
          param: { memberId: String(memberId) }
        }),
      logContext: 'loading safeguarding record',
      onSuccess: (response) => {
        this.safeguarding = response.data;
      },
      onError: () => {
        snackbar.error('snackbar.pace.load_failed');
      }
    });
  }

  async saveSafeguarding(memberId: number, fields: TUpdateSafeguarding) {
    const parsed = ZUpdateSafeguarding.safeParse(fields);

    if (!parsed.success) {
      snackbar.error('snackbar.pace.save_failed');
      return;
    }

    const saved = await this.execute<UpdateSafeguardingRequest>({
      requestFn: () =>
        classroomio.organization.fellows[':memberId'].safeguarding.$put({
          param: { memberId: String(memberId) },
          json: parsed.data
        }),
      logContext: 'saving safeguarding record',
      onSuccess: () => {
        snackbar.success('snackbar.pace.saved');
      },
      onError: () => {
        snackbar.error('snackbar.pace.save_failed');
      }
    });

    if (saved) await this.loadSafeguarding(memberId, { keepCurrent: true });

    return saved;
  }
}

export const paceApi = new PaceApi();
