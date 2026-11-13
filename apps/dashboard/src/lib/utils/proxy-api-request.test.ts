import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildProxiedApiResponse,
  clientIpSeenByDashboard,
  proxyRequestToApi,
  shouldForwardToApi
} from './proxy-api-request';

describe('shouldForwardToApi', () => {
  it('forwards /proxy and /api/auth paths', () => {
    expect(shouldForwardToApi('/proxy')).toBe(true);
    expect(shouldForwardToApi('/proxy/account')).toBe(true);
    expect(shouldForwardToApi('/api/auth')).toBe(true);
    expect(shouldForwardToApi('/api/auth/get-session')).toBe(true);
  });

  it('forwards OAuth discovery documents', () => {
    expect(shouldForwardToApi('/.well-known/oauth-authorization-server')).toBe(true);
    expect(shouldForwardToApi('/.well-known/oauth-protected-resource')).toBe(true);
    expect(shouldForwardToApi('/.well-known/openid-configuration/api/auth')).toBe(true);
  });

  it('forwards the remote MCP endpoint', () => {
    expect(shouldForwardToApi('/mcp')).toBe(true);
    expect(shouldForwardToApi('/mcp/')).toBe(true);
    expect(shouldForwardToApi('/mcpx')).toBe(false);
  });

  it('does not forward unrelated paths', () => {
    expect(shouldForwardToApi('/login')).toBe(false);
    expect(shouldForwardToApi('/api/csp-report')).toBe(false);
    expect(shouldForwardToApi('/.well-known/security.txt')).toBe(false);
  });
});

describe('buildProxiedApiResponse', () => {
  it('strips content-encoding and content-length so the browser does not re-decode', async () => {
    const upstream = new Response('{"user":null}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'content-length': '13',
        'transfer-encoding': 'chunked'
      }
    });

    const proxied = buildProxiedApiResponse(upstream);

    expect(proxied.status).toBe(200);
    expect(proxied.headers.get('content-type')).toBe('application/json');
    expect(proxied.headers.get('content-encoding')).toBeNull();
    expect(proxied.headers.get('content-length')).toBeNull();
    expect(proxied.headers.get('transfer-encoding')).toBeNull();
    expect(await proxied.text()).toBe('{"user":null}');
  });

  it('strips HTTP/1 connection-specific headers that crash HTTP/2', async () => {
    const upstream = new Response('{"ok":true}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        'proxy-connection': 'keep-alive'
      }
    });

    const proxied = buildProxiedApiResponse(upstream);

    expect(proxied.headers.get('connection')).toBeNull();
    expect(proxied.headers.get('keep-alive')).toBeNull();
    expect(proxied.headers.get('proxy-connection')).toBeNull();
  });

  it('preserves multiple Set-Cookie headers without collapsing Expires commas', async () => {
    const upstreamHeaders = new Headers({
      'content-type': 'application/json',
      'content-encoding': 'gzip'
    });
    upstreamHeaders.append(
      'set-cookie',
      'better-auth.session_token=abc; Path=/; HttpOnly; Expires=Wed, 21 Oct 2026 07:28:00 GMT'
    );
    upstreamHeaders.append(
      'set-cookie',
      'better-auth.csrf_token=xyz; Path=/; HttpOnly; Expires=Thu, 22 Oct 2026 07:28:00 GMT'
    );

    const proxied = buildProxiedApiResponse(
      new Response('{"ok":true}', {
        status: 200,
        headers: upstreamHeaders
      })
    );

    expect(proxied.headers.getSetCookie()).toEqual([
      'better-auth.session_token=abc; Path=/; HttpOnly; Expires=Wed, 21 Oct 2026 07:28:00 GMT',
      'better-auth.csrf_token=xyz; Path=/; HttpOnly; Expires=Thu, 22 Oct 2026 07:28:00 GMT'
    ]);
    expect(proxied.headers.get('content-encoding')).toBeNull();
    expect(await proxied.text()).toBe('{"ok":true}');
  });
});

describe('clientIpSeenByDashboard', () => {
  it('uses the edge x-real-ip ahead of a caller-supplied forwarding chain', () => {
    const request = new Request('https://dashboard.example/api/auth/sign-in/email', {
      headers: {
        'x-real-ip': '198.51.100.20',
        'x-forwarded-for': '203.0.113.9, 10.0.0.8'
      }
    });

    expect(clientIpSeenByDashboard(request)).toBe('198.51.100.20');
  });
});

describe('proxyRequestToApi', () => {
  const originalPrivateServerUrl = process.env.PRIVATE_SERVER_URL;
  const originalPrivateServerKey = process.env.PRIVATE_SERVER_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalPrivateServerUrl === undefined) {
      delete process.env.PRIVATE_SERVER_URL;
    } else {
      process.env.PRIVATE_SERVER_URL = originalPrivateServerUrl;
    }

    if (originalPrivateServerKey === undefined) {
      delete process.env.PRIVATE_SERVER_KEY;
    } else {
      process.env.PRIVATE_SERVER_KEY = originalPrivateServerKey;
    }

    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns 502 when PRIVATE_SERVER_URL is missing', async () => {
    delete process.env.PRIVATE_SERVER_URL;

    const response = await proxyRequestToApi(new Request('https://app.example/api/auth/get-session'));

    expect(response.status).toBe(502);
    expect(await response.text()).toBe('API upstream not configured');
  });

  it('requests identity encoding and returns a stripped response', async () => {
    process.env.PRIVATE_SERVER_URL = 'http://api.internal:3081';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"session":null}', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'content-length': '16'
        }
      })
    );
    global.fetch = fetchMock as typeof fetch;

    const response = await proxyRequestToApi(
      new Request('https://dashboard.example/api/auth/get-session', {
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate, br',
          cookie: 'better-auth.session_token=test'
        }
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [upstreamUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(upstreamUrl)).toBe('http://api.internal:3081/api/auth/get-session');
    expect(init.method).toBe('GET');

    const upstreamHeaders = new Headers(init.headers);
    expect(upstreamHeaders.get('accept-encoding')).toBe('identity');
    expect(upstreamHeaders.get('host')).toBe('api.internal:3081');
    expect(upstreamHeaders.get('x-forwarded-host')).toBe('dashboard.example');
    expect(upstreamHeaders.get('cookie')).toBe('better-auth.session_token=test');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(await response.text()).toBe('{"session":null}');
  });

  it('forwards the edge client IP and drops a spoofed forwarding header', async () => {
    process.env.PRIVATE_SERVER_URL = 'http://api.internal:3081';
    process.env.PRIVATE_SERVER_KEY = 'proxy-key';

    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await proxyRequestToApi(
      new Request('https://dashboard.example/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-real-ip': '198.51.100.20',
          'x-forwarded-for': '203.0.113.9',
          'x-cio-client-ip': '192.0.2.1',
          'x-cio-proxy-key': 'spoofed'
        },
        body: JSON.stringify({ email: 'fellow@example.com', password: 'secret' })
      })
    );

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const upstreamHeaders = new Headers(init.headers);
    expect(upstreamHeaders.get('x-cio-client-ip')).toBe('198.51.100.20');
    expect(upstreamHeaders.get('x-cio-proxy-key')).toBe('proxy-key');
    expect(upstreamHeaders.get('x-real-ip')).toBe('198.51.100.20');
    expect(upstreamHeaders.get('x-forwarded-for')).toBe('198.51.100.20');
  });
});
