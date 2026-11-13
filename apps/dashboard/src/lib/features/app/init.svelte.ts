import { BaseApi, classroomio } from '$lib/utils/services/api';
import {
  currentOrg,
  getAppOrigin,
  getOrgPublicUrl,
  isOrgManagerRole,
  mergeAccountOrgFromServer,
  orgs
} from '$lib/utils/store/org';
import { defaultProfileState, defaultUserState, profile, user } from '$lib/utils/store/user';

import type { AccountResponse, AccountSuccess } from './types';
import { type AppOrgParams } from './resolve-app-org-params';
import type { PendingOrgInvite } from '$features/lms/utils/types';
import { PUBLIC_IS_SELFHOSTED } from '$env/static/public';
import type { TUser } from '@cio/db/types';
import { authClient } from '$lib/utils/services/auth/client';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { activateLocale, handleLocaleChange } from '$lib/utils/functions/translations';
import { identifyPosthogUser } from '$lib/utils/services/posthog';
import { identifyUserJotUser } from '$lib/utils/services/userjot';
import { isOrgStudent, globalStore } from '$lib/utils/store/app';
import { isPublicRoute } from '$lib/utils/functions/routes/isPublicRoute';
import { isOnboardingIncomplete } from '$features/onboarding/utils/completeness';
import { licenseApi } from '$features/license/api/license.svelte';
import { logout } from '$lib/utils/functions/logout';
import { t } from '$lib/utils/functions/translations';
import {
  ACCOUNT_CACHE_TTL_MS,
  accountFailureFromError,
  accountRetryDelayMs,
  decideAccountFetch
} from './account-fetch';
import { page } from '$app/state';
import { resolve } from '$app/paths';
import { setSentryUser } from '$lib/utils/services/sentry';
import { setTheme } from '$lib/utils/functions/theme';
import { setupAnalyticsBasedOnLicense } from '$lib/utils/functions/appSetup';
import shouldRedirectOnAuth from '$lib/utils/functions/routes/shouldRedirectOnAuth';
import { postAuthDestination } from './post-auth-destination';
import { ROLE } from '@cio/utils/constants';
import { STUDENT_HOME_ENTRY_PATH } from '@cio/utils/lms';

type AppSetupParams = AppOrgParams;

function tenantSyncKey(params: AppSetupParams): string | null {
  if (!params.orgSiteName) {
    return null;
  }

  if (params.isOrgSite) {
    return `tenant:${params.orgSiteName}:${params.orgId ?? ''}`;
  }

  return `admin:${params.orgSiteName}`;
}

/*
  Manages everything related to loading the logged in user and setting up the organization.
*/
class AppInitApi extends BaseApi {
  data = $state<AccountResponse>(null);
  session = $state<App.Locals | null>(null);
  pendingOrgInvite = $state<PendingOrgInvite | null>(null);
  showPendingInviteModal = $state(false);
  accountRetryEpoch = $state(0);
  private syncedTenantKey: string | null = null;
  private accountInFlight: Promise<AccountSuccess | undefined> | null = null;
  private accountCached: { at: number; data: AccountSuccess } | null = null;
  private accountRetryNotBefore = 0;
  private accountRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private accountAttempt = 0;

  get loading() {
    return this.isLoading;
  }

  async setupApp(locals: App.Locals, params: AppSetupParams): Promise<boolean | undefined> {
    if (this.isLoading || this.isInitializedAndReady) {
      return;
    }

    if (Date.now() < this.accountRetryNotBefore && !this.accountInFlight) {
      this.armAccountRetry(Math.max(0, this.accountRetryNotBefore - Date.now()));
      return;
    }

    this.isLoading = true;

    try {
      if (!locals.user) {
        if (!params.isOrgSite) {
          goto(resolve('/login', {}));
          return false;
        }

        console.log('No user found in locals');
        return;
      }

      this.session = locals;

      const needsTenantMembership = params.isOrgSite && params.orgId && !this.isMemberOfOrg(locals, params.orgId);

      if (needsTenantMembership && params.orgId) {
        const orgId = params.orgId;
        const [pendingInvite, accountData] = await Promise.all([
          this.fetchPendingOrgInvite(orgId),
          this.fetchAccountData()
        ]);

        if (!accountData) {
          return false;
        }

        if (pendingInvite) {
          this.showPendingOrgInvite(pendingInvite);
        }

        this.applyAccountData(accountData, params);
        return;
      }

      const accountData = await this.fetchAccountData();
      if (accountData) {
        this.applyAccountData(accountData, params);
      }
    } finally {
      if (!this.isInitializedAndReady) {
        this.isLoading = false;
      }
    }
  }

  /**
   * Whether the current session already reflects membership in `orgId`.
   * Better Auth's `customSession` attaches an `orgRoles` map ({ orgId: roleId })
   * that RBAC middlewares also use, so a present key means the user is a member.
   */
  private isMemberOfOrg(locals: App.Locals, orgId: string): boolean {
    const orgRoles = locals.orgRoles;

    return !!orgRoles && orgId in orgRoles;
  }

  private applyAccountData(accountData: AccountSuccess, params: AppSetupParams) {
    this.resetErrors();
    this.success = true;
    this.data = accountData;
    this.setupStores(params);
    licenseApi.syncFromAccount(accountData.licenseFeatures, get(currentOrg));
    setupAnalyticsBasedOnLicense(
      accountData.profile?.id
        ? { id: accountData.profile.id, email: accountData.profile.email, name: accountData.profile.fullname }
        : undefined,
      params.isOrgSite
    );
    this.setUserAnalytics();
    this.routeUserToNextPage(params);
  }

  private async fetchAccountData(): Promise<AccountSuccess | undefined> {
    if (this.accountCached && Date.now() - this.accountCached.at < ACCOUNT_CACHE_TTL_MS) {
      return this.accountCached.data;
    }

    if (Date.now() < this.accountRetryNotBefore) {
      return undefined;
    }

    if (this.accountInFlight) return this.accountInFlight;

    const request = this.requestAccount();
    this.accountInFlight = request;

    try {
      return await request;
    } finally {
      if (this.accountInFlight === request) {
        this.accountInFlight = null;
      }
    }
  }

  private async requestAccount(): Promise<AccountSuccess | undefined> {
    let response: Response;

    try {
      response = await classroomio.account.$get();
    } catch (error) {
      console.error('Error fetching account:', error);
      const failure = accountFailureFromError(error);
      this.rememberAccountFailure(failure.kind, failure.retryAfter);
      return undefined;
    }

    const decision = decideAccountFetch(response.status);
    if (decision === 'signed_out') {
      this.accountCached = null;
      void logout();
      return undefined;
    }

    if (decision === 'retry' || decision === 'keep_session') {
      const kind = decision === 'retry' && response.status === 429 ? 'rate_limited' : 'unavailable';
      this.rememberAccountFailure(kind, response.headers.get('Retry-After'));
      return undefined;
    }

    try {
      const result = (await response.json()) as AccountResponse;
      if (!result?.success) {
        this.rememberAccountFailure('unavailable');
        return undefined;
      }

      this.accountCached = { at: Date.now(), data: result };
      this.accountAttempt = 0;
      this.accountRetryNotBefore = 0;
      this.error = null;
      return result;
    } catch (error) {
      console.error('Error fetching account:', error);
      this.rememberAccountFailure('unavailable');
      return undefined;
    }
  }

  private rememberAccountFailure(kind: 'rate_limited' | 'unavailable', retryAfterHeader: string | null = null) {
    const delayMs = accountRetryDelayMs(this.accountAttempt, retryAfterHeader);
    this.accountAttempt += 1;
    this.accountRetryNotBefore = Date.now() + delayMs;
    this.armAccountRetry(delayMs);

    if (this.data) return;

    this.error = accountFailureMessage(kind);
  }

  private armAccountRetry(delayMs: number) {
    if (this.accountRetryTimer) return;

    this.accountRetryTimer = setTimeout(() => {
      this.accountRetryTimer = null;
      this.accountRetryEpoch += 1;
    }, delayMs);
  }

  private showPendingOrgInvite(pendingInvite: PendingOrgInvite) {
    this.pendingOrgInvite = pendingInvite;
    this.showPendingInviteModal = true;
  }

  private async fetchPendingOrgInvite(orgId: string): Promise<PendingOrgInvite | null> {
    try {
      const response = await classroomio.invite.organization.pending.$get({}, { headers: { 'cio-org-id': orgId } });
      const result = await response.json();

      if (result.success && result.data) {
        return result.data;
      }
    } catch (error) {
      console.warn('pending org invite check failed', error);
    }

    return null;
  }

  /**
   * Re-pin org context after setupApp when the URL org changes.
   *
   * setupApp only runs once per session; tenant subdomains and `/org/[slug]`
   * routes can change without another /account fetch. This keeps `currentOrg`
   * aligned with the URL and surfaces pending invitations when needed.
   */
  async syncOrgContext(params: AppSetupParams): Promise<void> {
    if (!this.data?.success || !params.orgSiteName) {
      return;
    }

    const nextTenantKey = tenantSyncKey(params);
    if (nextTenantKey && nextTenantKey === this.syncedTenantKey) {
      return;
    }

    const isMember = this.data.organizations.some((org) => org.siteName === params.orgSiteName);
    if (params.isOrgSite && params.orgId && !isMember) {
      const pendingInvite = await this.fetchPendingOrgInvite(params.orgId);
      if (pendingInvite) {
        this.showPendingOrgInvite(pendingInvite);
      }
    }

    this.setOrgStore(params);
    licenseApi.syncFromAccount(this.data.licenseFeatures, get(currentOrg));
  }

  /*
    1. Update user store
    2. Update profile store
    3. Update organizations store
  */
  setupStores(params?: AppSetupParams) {
    if (!this.data?.success || !this.session) {
      return;
    }

    user.update((_user) => ({
      ..._user,
      fetchingUser: false,
      isLoggedIn: true,
      currentSession: (this.session?.user as unknown as TUser) || undefined
    }));

    profile.set(this.data.profile);
    const orgSite = params?.isOrgSite
      ? this.data.organizations.find((org) => org.id === params.orgId || org.siteName === params.orgSiteName)
      : undefined;
    const enforcedLocale = orgSite?.settings?.language?.enforced
      ? orgSite.settings.language.locale
      : params?.orgLocaleEnforced
        ? params.orgLocale
        : undefined;
    if (enforcedLocale) {
      activateLocale(enforcedLocale);
    } else {
      handleLocaleChange(this.data.profile.locale ?? params?.orgLocale ?? 'en');
    }

    this.setOrgStore(params);
  }

  setOrgStore(params?: AppSetupParams) {
    if (!this.data?.success || !this.data) {
      return;
    }

    orgs.set(this.data.organizations.map((org) => mergeAccountOrgFromServer(org)));

    const nextOrg = this.pickCurrentOrg(params);
    if (!nextOrg) {
      return;
    }

    currentOrg.set(mergeAccountOrgFromServer(nextOrg));

    if (nextOrg.siteName) {
      localStorage.setItem('classroomio_org_sitename', nextOrg.siteName);
    }

    const theme = get(currentOrg)?.theme;

    setTheme(theme || 'blue');
    this.syncedTenantKey = tenantSyncKey(params ?? { isOrgSite: false, orgSiteName: '' });
  }

  /**
   * Prefer the tenant from the current URL on org sites. Only fall back to
   * localStorage / the first account org on the admin host (`app.*`).
   */
  private pickCurrentOrg(params?: AppSetupParams) {
    const organizations = this.data?.success ? this.data.organizations : [];
    const urlResolvedOrg = get(currentOrg);

    if (params?.orgSiteName) {
      const membership = organizations.find((org) => org.siteName === params.orgSiteName);
      if (membership) {
        return membership;
      }

      if (params.isOrgSite) {
        if (PUBLIC_IS_SELFHOSTED === 'true') {
          const managedOrganizations = organizations.filter((org) => isOrgManagerRole(org.roleId));
          const accountOrganization = managedOrganizations[0] ?? organizations[0];
          if (accountOrganization) {
            return accountOrganization;
          }
        }

        // Keep the server-resolved tenant org (set from URL in +layout.svelte) instead
        // of switching to another membership from /account.
        if (urlResolvedOrg.siteName === params.orgSiteName && urlResolvedOrg.id) {
          return urlResolvedOrg;
        }

        if (params.orgId && urlResolvedOrg.id === params.orgId) {
          return urlResolvedOrg;
        }

        return undefined;
      }
    }

    if (!organizations.length) {
      return undefined;
    }

    const managedOrganizations = organizations.filter((org) => isOrgManagerRole(org.roleId));
    const lastOrgSiteName = localStorage.getItem('classroomio_org_sitename');

    return (
      managedOrganizations.find((org) => org.siteName === lastOrgSiteName) ??
      managedOrganizations[0] ??
      organizations[0]
    );
  }

  routeUserToNextPage(params: AppSetupParams) {
    console.log('routeUserToNextPage', window.location.pathname);
    if (!this.data?.success) {
      return;
    }

    const { isOrgSite, orgId, orgSiteName } = params;
    const path = window.location.pathname;
    if (path === '/join-academy') {
      return;
    }

    const isCloud = PUBLIC_IS_SELFHOSTED !== 'true';
    const isCurrentOrgMember = this.data.organizations.some(
      (organization) => organization.id === orgId || organization.siteName === orgSiteName
    );
    const isCloudOrgSiteNonMember = isCloud && isOrgSite && !isCurrentOrgMember;
    const redirect = page.url.searchParams.get('redirect');
    const redirectTargetsLms = redirect === '/lms' || redirect?.startsWith('/lms?');
    if (isCloudOrgSiteNonMember && (path.startsWith('/lms') || redirectTargetsLms)) {
      if (path !== '/') {
        window.location.href = '/';
      }

      return;
    }

    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      console.log('redirecting to', redirect);
      // goto redirect won't accept dynamic url so we need to use window.location.href
      window.location.replace(redirect);
      return;
    }

    const authDestination = postAuthDestination({
      pathname: path,
      isOrgSite,
      orgId,
      orgSiteName,
      organizations: this.data.organizations
    });
    if (authDestination) {
      window.location.replace(authDestination);
      return;
    }

    const isAuthEntry = path === '/login' || path === '/signup';
    if (isPublicRoute(path) && (path !== '/' || isOrgSite) && !isAuthEntry) {
      console.log('no redirect is needed');
      return;
    }

    if (isCloudOrgSiteNonMember) {
      if (path !== '/') {
        window.location.href = '/';
      }

      return;
    }

    const isStudent = get(isOrgStudent);
    const userHasOrganizations = this.data.organizations.length > 0;
    const userIsManager = this.data.organizations.some((org) => isOrgManagerRole(org.roleId));
    const needsOnboarding =
      userIsManager && !this.data.profile.isEmailVerified && isOnboardingIncomplete(this.data.profile);

    // CLOUD: when user has no orgs and isOrgSite is false, route to /onboarding
    // isOrgSite - means the user is on a multi tenant organization site, we don't want to redirect to /onboarding in this case
    if (isCloud) {
      const shouldRedirectToOnboarding = !userHasOrganizations && !isOrgSite;
      if (shouldRedirectToOnboarding) {
        console.log('cloud: redirecting to onboarding');
        return goto(resolve(`/onboarding`, {}));
      }
    } else {
      // Self-hosted: when user has no orgs, route to /onboarding
      if (!userHasOrganizations) {
        console.log('self-hosted: redirecting to onboarding');
        return goto(resolve(`/onboarding`, {}));
      }
    }

    if (needsOnboarding && !isOrgSite && !path.includes('/onboarding')) {
      console.log('redirecting to onboarding to finish setup');
      return goto(resolve(`/onboarding`, {}));
    }

    if (!shouldRedirectOnAuth(page.url.pathname)) return;

    if (path.includes('/onboarding') && ((isStudent && userHasOrganizations) || needsOnboarding)) {
      return;
    }

    const shouldGoToLMS = isCloud ? isOrgSite || !!isStudent : !!isStudent;
    console.log('redirecting to', shouldGoToLMS ? 'lms' : 'org');
    return shouldGoToLMS ? this.goToLMS(isOrgSite) : this.goToOrg();
  }

  goToLMS(isOrgSite: boolean) {
    const isCloud = PUBLIC_IS_SELFHOSTED !== 'true';
    const isStudent = get(isOrgStudent);
    const selectedOrg = get(currentOrg);
    const userHasOneOrg = this.data.organizations.length === 1;
    const userIsStudentInAllOrgs = this.data.organizations.every((org) => org.roleId === ROLE.STUDENT);
    const userIsAdminInAtleastOneOrg = this.data.organizations.some((org) => org.roleId === ROLE.ADMIN);

    if (userHasOneOrg && isCloud && !isOrgSite && isStudent && selectedOrg.siteName && userIsStudentInAllOrgs) {
      window.location.href = getOrgPublicUrl(selectedOrg, STUDENT_HOME_ENTRY_PATH);
      return;
    }

    // User is an admin in at least one org, so they should be redirected to the org dashboard.
    if (userIsAdminInAtleastOneOrg && isCloud && !isOrgSite) {
      const orgWithAdminRole = this.data.organizations.find((org) => org.roleId === ROLE.ADMIN);

      goto(resolve(`/org/${orgWithAdminRole.siteName}`, {}));
      return;
    }

    goto(resolve('/lms', {}));
  }

  goToOrg() {
    const selectedOrg = get(currentOrg);

    goto(resolve(`/org/${selectedOrg.siteName}`, {}));
  }

  setUserAnalytics() {
    const profileStore = get(profile);

    if (!profileStore?.id) return;

    setSentryUser({
      id: profileStore.id,
      username: profileStore.username,
      email: profileStore.email,
      fullname: profileStore.fullname
    });

    identifyPosthogUser(profileStore.id, {
      email: profileStore.email,
      name: profileStore.fullname
    });

    identifyUserJotUser({
      id: profileStore.id,
      email: profileStore.email ?? undefined,
      fullname: profileStore.fullname,
      avatarUrl: profileStore.avatarUrl ?? undefined
    });
  }

  /**
   * Re-fetches the account and re-seeds the stores, e.g. after a plan is connected to the organization.
   */
  async refreshAccountData(): Promise<void> {
    const accountData = await this.fetchAccountData();

    if (!accountData) return;

    this.data = accountData;
    this.setupStores();
  }

  async handlePendingInviteAccepted(redirectTo?: string): Promise<void> {
    this.showPendingInviteModal = false;
    this.pendingOrgInvite = null;

    await authClient.getSession({ query: { disableCookieCache: true } });

    const response = await classroomio.account.$get();
    const accountData = (await response.json()) as AccountResponse;
    if (accountData?.success) {
      this.data = accountData;
      this.setupStores();
    }

    const isOnOrgSite = get(globalStore).isOrgSite;
    if (redirectTo?.startsWith('/org/') && isOnOrgSite) {
      window.location.href = `${getAppOrigin()}${redirectTo}`;
      return;
    }

    if (redirectTo) {
      window.location.href = redirectTo;
      return;
    }

    window.location.reload();
  }

  reset() {
    super.reset();
    this.data = null;
    this.accountCached = null;
    this.accountRetryNotBefore = 0;
    this.accountAttempt = 0;
    this.accountInFlight = null;
    if (this.accountRetryTimer) {
      clearTimeout(this.accountRetryTimer);
      this.accountRetryTimer = null;
    }
    this.syncedTenantKey = null;
    this.pendingOrgInvite = null;
    this.showPendingInviteModal = false;
    licenseApi.reset();

    user.set(defaultUserState);
    profile.set(defaultProfileState);
  }

  get isInitializedAndReady() {
    return !this.isLoading && !this.error && this.data !== null;
  }
}

function accountFailureMessage(kind: 'rate_limited' | 'unavailable'): string {
  const key = kind === 'rate_limited' ? 'app_init.account_rate_limited' : 'app_init.account_unavailable';

  try {
    const message = t.get(key);
    if (message && message !== key) return message;
  } catch {
    // Translations are not loaded for the first account fetch on a cold page.
  }

  if (kind === 'rate_limited') {
    return 'Too many requests. You are still signed in, and we will try again.';
  }

  return 'We could not load your account. You are still signed in, and we will try again.';
}

export const appInitApi = new AppInitApi();
