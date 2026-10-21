/**
 * Fetching through a CORS proxy, for the sources in a browser.
 *
 * Most of what the sources read cannot be read from a web page: Foundry VTT's package index
 * answers only foundryvtt.com, and GitHub's release downloads, the release notes and Docker Hub
 * send no CORS headers at all. A proxy fetches them on the page's behalf. Most proxies take the
 * target in a query parameter (`https://proxy.example/?url=…`), which must be percent-encoded:
 * unencoded, `%2F` in a GitLab project path is decoded on the way, and a `&` in the target ends
 * the parameter.
 */

/** Where a proxy fetches a target from: a template with `{url}`, or a function. */
export type ProxyUrl = string | ((url: string) => string);

/** The proxy URL for a target: `{url}` in a template becomes the target, percent-encoded. */
export function proxyUrlFor(proxy: ProxyUrl, url: string): string {
  if (typeof proxy === 'function') return proxy(url);
  if (!proxy.includes('{url}')) throw new Error(`A proxy template needs {url}: ${proxy}`);
  return proxy.replaceAll('{url}', encodeURIComponent(url));
}

/**
 * A `fetch` that fetches every URL through a proxy, such as
 * `proxiedFetch(fetch, 'https://proxy.example/?url={url}')`. A request's method, headers and body
 * go with it; what reaches the target is the proxy's business. Some proxies drop `Authorization`,
 * so a token sent that way may never arrive.
 *
 * @throws When `proxy` is a template without `{url}`
 */
export function proxiedFetch(fetch: typeof globalThis.fetch, proxy: ProxyUrl): typeof globalThis.fetch {
  if (typeof proxy === 'string') proxyUrlFor(proxy, '');
  return (input, init) => {
    if (input instanceof Request) return fetch(new Request(proxyUrlFor(proxy, input.url), input), init);
    return fetch(proxyUrlFor(proxy, String(input)), init);
  };
}
