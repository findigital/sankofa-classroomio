// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte/svelte5';

vi.mock('$app/environment', () => ({ browser: false, dev: true, building: false }));
vi.mock('$env/static/public', () => ({ PUBLIC_IS_SELFHOSTED: 'false' }));
vi.mock('$features/org/api/org.svelte', () => ({
  orgApi: {
    listCatalogOrder: async () => [],
    saveCatalogOrder: async () => true
  }
}));

import { ensureTranslations } from '$lib/utils/functions/translations';
import Page from '../../../../routes/(app)/org/[slug]/courses/order/+page.svelte';

beforeAll(async () => {
  await ensureTranslations('en');
});

describe('course order page', () => {
  it('renders the page body', () => {
    const { container } = render(Page);
    const body = container.innerHTML;

    expect(body).toContain('Only an organization admin can reorder courses.');
    expect(body).toContain('Course order');
  });
});
