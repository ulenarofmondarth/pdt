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
  /** A body of bytes, such as part of a zip. */
  readonly bytes?: Uint8Array;
  /** More headers to send back. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** What a URL answers: an answer, or one made for each request. */
export type Answers = Record<string, Answer | ((request: Request) => Answer)>;

export interface Request {
  readonly url: string;
  readonly headers: Record<string, string>;
}

export function fakeFetch(answers: Answers) {
  const requests: Request[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const request = { url, headers: (init?.headers ?? {}) as Record<string, string> };
    requests.push(request);
    const given = answers[url];
    const answer = typeof given === 'function' ? given(request) : (given ?? { status: 404 });
    if (answer.unreachable === true) return Promise.reject(new TypeError('fetch failed'));
    const status = answer.status ?? 200;
    const body = status === 304 ? null : (answer.bytes?.slice() ?? answer.text ?? JSON.stringify(answer.body ?? null));
    return Promise.resolve(
      new Response(body, {
        status,
        headers: { ...answer.headers, ...(answer.etag !== undefined && { etag: answer.etag }) },
      }),
    );
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

/**
 * Answers for a file whose server reads the `Range` header, as a file server does: `bytes=-n` for
 * the last `n` bytes, `bytes=a-b` or `bytes=a-` for those from `a`. It gives the file's size in
 * `Content-Range` unless told to hide it, as a browser does when the server does not expose it.
 */
export function ranged(file: Uint8Array, { size = true } = {}): (request: Request) => Answer {
  return ({ headers }) => {
    const match = /^bytes=(\d*)-(\d*)$/.exec(headers['Range'] ?? '');
    if (match === null) return { bytes: file };
    const [, from = '', to = ''] = match;
    const start = from === '' ? Math.max(0, file.length - Number(to)) : Number(from);
    const end = from === '' || to === '' ? file.length : Math.min(file.length, Number(to) + 1);
    if (start >= file.length) return { status: 416 };
    const range = `bytes ${String(start)}-${String(end - 1)}/${String(file.length)}`;
    return { status: 206, bytes: file.subarray(start, end), ...(size && { headers: { 'Content-Range': range } }) };
  };
}
