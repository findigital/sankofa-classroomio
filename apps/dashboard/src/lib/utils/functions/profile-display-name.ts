/**
 * Learner label for lists: profile full name when it is set, otherwise username.
 */
export function profileDisplayName(
  profile: { fullname?: string | null; username?: string | null } | null | undefined
): string {
  const fullname = profile?.fullname?.trim() ?? '';
  if (fullname) return fullname;

  return profile?.username?.trim() ?? '';
}
