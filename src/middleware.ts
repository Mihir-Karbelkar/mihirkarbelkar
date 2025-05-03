import type { MiddlewareHandler } from 'astro';

const HOSTNAME = process.env.ASTRO_ENV !== 'DEV' ? 'mihirkarbelkar.com' : 'localhost:4321';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { request, url } = context;
  const hostname = url.host;

  // Handle subdomains
  const subdomain = hostname.split('.')[0];


  const rootHost = HOSTNAME.slice(HOSTNAME.indexOf('.') + 1)
  const newUrl = `${url.protocol}//${rootHost}/${subdomain}`
  console.log(url, hostname, HOSTNAME, newUrl, 'here')
  // Handle main domain
  if (hostname === HOSTNAME) {
    return next();
  }

  // Rewrite any subdomain to its corresponding path
  return context.rewrite(newUrl);
}; 