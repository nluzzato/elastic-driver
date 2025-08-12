export type HttpOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export class HttpTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'HttpTimeoutError';
  }
}

export async function httpFetch(url: string, opts: HttpOptions = {}): Promise<Response> {
  const { retries = 0, retryDelayMs = 1000, ...fetchOpts } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);

    try {
      const headers = { ...(fetchOpts.headers || {}) } as Record<string, string>;
      const hasContentType = Object.keys(headers).some(
        (h) => h.toLowerCase() === 'content-type'
      );

      let bodyToSend: BodyInit | undefined = undefined;
      if (fetchOpts.body !== undefined) {
        const isString = typeof fetchOpts.body === 'string';
        const isFormLike =
          fetchOpts.body instanceof URLSearchParams ||
          fetchOpts.body instanceof FormData ||
          fetchOpts.body instanceof Blob;
        const isUrlEncoded = hasContentType && headers['Content-Type'] === 'application/x-www-form-urlencoded';

        if (isString || isFormLike || isUrlEncoded) {
          bodyToSend = fetchOpts.body as BodyInit;
        } else {
          if (!hasContentType) headers['Content-Type'] = 'application/json';
          bodyToSend = JSON.stringify(fetchOpts.body);
        }
      }

      const response = await fetch(url, {
        method: fetchOpts.method ?? 'GET',
        headers,
        body: bodyToSend,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      if (!response.ok && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpTimeoutError(url, opts.timeoutMs ?? 30000);
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

export async function httpFetchJson<T = any>(url: string, opts: HttpOptions = {}): Promise<T> {
  const response = await httpFetch(url, opts);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  return response.json();
}


