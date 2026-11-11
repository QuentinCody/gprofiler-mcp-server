export interface GprofilerFetchOptions {
  baseUrl?: string;
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function gprofilerFetch(
  path: string,
  params?: Record<string, unknown>,
  opts?: GprofilerFetchOptions,
): Promise<Response> {
  const url = new URL(`${opts?.baseUrl ?? "https://biit.cs.ut.ee/gprofiler/api"}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return fetch(url, {
    method: opts?.method ?? "GET",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "gprofiler-mcp-server/1.0 (bio-mcp)" },
    body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts?.signal ?? AbortSignal.timeout(45_000),
    redirect: "manual",
  });
}
