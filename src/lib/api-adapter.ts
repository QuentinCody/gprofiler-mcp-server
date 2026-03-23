import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { gprofilerFetch } from "./http";

export function createGprofilerApiFetch(): ApiFetchFn {
	return async (request) => {
		const path = request.path;

		// g:Profiler endpoints are all POST with JSON body.
		// When called via api.post(path, body), body comes in request.body
		// When called via api.get(path, params), params come in request.params
		const isPost = request.body !== undefined;

		const response = await gprofilerFetch(path, isPost ? undefined : request.params, {
			method: isPost ? "POST" : "GET",
			body: isPost ? (request.body as object) : undefined,
		});

		if (!response.ok) {
			let errorBody: string;
			try {
				errorBody = await response.text();
			} catch {
				errorBody = response.statusText;
			}
			const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
				status: number;
				data: unknown;
			};
			error.status = response.status;
			error.data = errorBody;
			throw error;
		}

		const data = await response.json();
		return { status: response.status, data };
	};
}
