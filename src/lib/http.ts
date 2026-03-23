import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const GPROFILER_BASE = "https://biit.cs.ut.ee/gprofiler/api";

export interface GprofilerFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
	baseUrl?: string;
	method?: string;
}

/**
 * Fetch from the g:Profiler API.
 * All g:Profiler endpoints use POST with JSON body.
 * GET is supported as a fallback for query-param-based requests.
 */
export async function gprofilerFetch(
	path: string,
	params?: Record<string, unknown>,
	opts?: GprofilerFetchOptions,
): Promise<Response> {
	const baseUrl = opts?.baseUrl ?? GPROFILER_BASE;
	const method = opts?.method ?? "GET";

	if (method === "POST" && opts?.body) {
		// POST with JSON body — direct fetch for full control
		const url = new URL(path, baseUrl);
		return fetch(url.toString(), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				"User-Agent": "gprofiler-mcp-server/1.0 (bio-mcp)",
			},
			body: JSON.stringify(opts.body),
		});
	}

	return restFetch(baseUrl, path, params, {
		...opts,
		headers: { Accept: "application/json", ...(opts?.headers ?? {}) },
		retryOn: [429, 500, 502, 503],
		retries: opts?.retries ?? 3,
		timeout: opts?.timeout ?? 30_000,
		userAgent: "gprofiler-mcp-server/1.0 (bio-mcp)",
	});
}
