import type { MiddlewareHandler } from 'astro';
export function subdomainPath(
  hostname: string,
  pathname: string,
): string | null {
  if (!hostname.endsWith('.mihirkarbelkar.com')) return null;
  const subdomain = hostname.slice(0, -'.mihirkarbelkar.com'.length);
  if (!['tech', 'politics', 'puns', 'fit'].includes(subdomain)) return null;
  if (
    pathname.startsWith('/api/') ||
    /\.[a-z0-9]+$/i.test(pathname) ||
    pathname.startsWith(`/${subdomain}`)
  )
    return null;
  return `/${subdomain}${pathname}`;
}
export const onRequest: MiddlewareHandler = async (context, next) => {
  const path = subdomainPath(context.url.hostname, context.url.pathname);
  const response = path ? await context.rewrite(path) : await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=()',
  );
  if (context.url.pathname.startsWith('/api/'))
    response.headers.set('Cache-Control', 'no-store');
  return response;
};
