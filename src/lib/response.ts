import { fail, readGprofilerResponse } from "./read-response";

export { fail } from "./read-response";

/** Bound the decoded body, including errors and chunked responses. */
export async function readJson(response: Response): Promise<unknown> {
  const text = await readGprofilerResponse(response);
  const evidence = { response: text, http_status: response.status, source_url: response.url || undefined,
    retry_after: response.headers.get("Retry-After"), incomplete: true };
  let data: unknown;
  try { data = JSON.parse(text); } catch { if (response.ok) fail("g:Profiler returned invalid JSON", 502, evidence); }
  if (!response.ok) fail(`g:Profiler HTTP ${response.status}`, response.status, { ...evidence, problem: data });
  if (!data || typeof data !== "object") fail("g:Profiler returned an invalid response envelope", 502, evidence);
  if ("error" in data && data.error) fail("g:Profiler returned an error", 502, { ...evidence, problem: data });
  return data;
}

export async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
