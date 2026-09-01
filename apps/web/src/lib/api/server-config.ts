export function resolveApiServerUrl(
  env: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): string {
  const value = env.API_SERVER_URL?.replace(/\/+$/, '');

  if (value) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('API_SERVER_URL must be a valid HTTP(S) origin');
    }

    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isOriginOnly =
      url.pathname === '/' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '';

    if (!isHttp || !isOriginOnly) {
      throw new Error('API_SERVER_URL must be a valid HTTP(S) origin');
    }

    return url.origin;
  }

  if (nodeEnv !== 'production') {
    return 'http://localhost:3001';
  }

  throw new Error('API_SERVER_URL is required in production');
}
