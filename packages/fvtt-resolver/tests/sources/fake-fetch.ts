/**
 * A fake `fetch` for testing the sources: answers from a table of URLs, and records each request.
 */
export interface Answer {
  readonly status?: number;
  readonly body?: unknown;
  readonly etag?: string;
  /** Throw, as `fetch` does when the server cannot be reached. */
  readonly unreachable?: boolean;
  /** A body that is not JSON. */
  readonly text?: string;
}

export interface Request {
  readonly url: string;
  readonly headers: Record<string, string>;
}

export function fakeFetch(answers: Record<string, Answer | ((request: Request) => Answer)>) {
  const requests: Request[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const request = { url, headers: (init?.headers ?? {}) as Record<string, string> };
    requests.push(request);
    const given = answers[url];
    const answer = typeof given === 'function' ? given(request) : (given ?? { status: 404 });
    if (answer.unreachable === true) return Promise.reject(new TypeError('fetch failed'));
    const status = answer.status ?? 200;
    const body = status === 304 ? null : (answer.text ?? JSON.stringify(answer.body ?? null));
    return Promise.resolve(
      new Response(body, { status, headers: answer.etag === undefined ? {} : { etag: answer.etag } }),
    );
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}
