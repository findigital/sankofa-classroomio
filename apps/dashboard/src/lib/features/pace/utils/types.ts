import { classroomio, type InferResponseType } from '$lib/utils/services/api';

export type GetFellowPaceRequest = typeof classroomio.organization.fellows.pace.$get;
export type GetFellowPaceSuccess = Extract<InferResponseType<GetFellowPaceRequest>, { success: true }>;
export type FellowPaceData = GetFellowPaceSuccess['data'];
export type FellowPaceFellow = FellowPaceData['fellows'][number];
export type PaceCourseOption = FellowPaceData['courses'][number];
export type PaceCohortOption = FellowPaceData['cohorts'][number];
export type FellowPaceQuery = {
  cohortId?: string;
  courseId?: string;
  quietDays?: number;
};

export type GetMentorRosterRequest = typeof classroomio.organization.fellows.mentors.$get;
export type GetMentorRosterSuccess = Extract<InferResponseType<GetMentorRosterRequest>, { success: true }>;
export type MentorRosterData = GetMentorRosterSuccess['data'];

export type ReplaceMentorFellowsRequest = (typeof classroomio.organization.fellows.mentors)[':mentorProfileId']['$put'];

export type GetSafeguardingRequest = (typeof classroomio.organization.fellows)[':memberId']['safeguarding']['$get'];
export type GetSafeguardingSuccess = Extract<InferResponseType<GetSafeguardingRequest>, { success: true }>;
export type SafeguardingView = GetSafeguardingSuccess['data'];

export type UpdateSafeguardingRequest = (typeof classroomio.organization.fellows)[':memberId']['safeguarding']['$put'];
