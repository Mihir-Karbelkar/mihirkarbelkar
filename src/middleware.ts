import type { MiddlewareHandler } from "astro";

const IS_DEV = process.env.ASTRO_ENV === "DEV";
const HOSTNAME = IS_DEV ? "localhost:4321" : "localhost:8787";

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { request, url } = context;

  // If request is to main host, pass through
  if (url.host === HOSTNAME) {
    return next();
  }

  const pathname = url.pathname;

  // Regex to detect static files (images, scripts, styles, fonts, etc.)
  const isAsset = pathname.match(
    /\.(css|js|png|jpe?g|svg|gif|webp|ico|woff2?|ttf|eot|otf|mp4|mp3|txt|xml|json|webmanifest)$/i
  );

  // Skip middleware if it's a static asset
  if (isAsset) {
    return next(); // Or just let it pass without modification
  }

  // Check if this is a subdomain request and not already rewritten
  if (!request.headers.get("X-Astro-Rewrite")) {
    const subdomain = url.host.split(".")[0];
    const path = url.pathname;

    // Construct the target URL
    const targetUrl = new URL(url);
    targetUrl.host = HOSTNAME;
    targetUrl.pathname = `/${subdomain}${path}`;
    console.log(targetUrl.toString(), HOSTNAME, path, subdomain, url);
    return context.rewrite(
      new Request(targetUrl.toString(), {
        headers: {
          "X-Astro-Rewrite": "true",
        },
      })
    );
  }

  // If we're already rewritten or no subdomain, proceed normally
  return next();
};
