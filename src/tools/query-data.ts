import type { McpServer } from "@bio-mcp/shared/mcp";
import { createQueryDataHandler } from "@bio-mcp/shared/staging/utils";
import { z } from "zod";
import { gprofilerResponse } from "../lib/tool-result";

interface QueryEnv {
	GPROFILER_DATA_DO?: unknown;
}

export function registerQueryData(server: McpServer, env?: QueryEnv): void {
	const handler = createQueryDataHandler("GPROFILER_DATA_DO", "gprofiler");

	for (const name of ["gprofiler_query_data", "mcp_gprofiler_query_data"]) server.registerTool(
		name,
		{
			title: "Query Staged g:Profiler Data",
			description:
				"Query staged g:Profiler results using SQL. Use this when responses are too large and have been staged with a data_access_id.",
			inputSchema: {
				data_access_id: z.string().min(1).describe("Data access ID for the staged dataset"),
				sql: z.string().min(1).describe("SQL query to execute against the staged data"),
				limit: z.number().int().positive().max(10000).optional().describe("Maximum number of rows to return (default: 100)"),
			},
		},
		async (args, extra) => {
			const runtimeEnv = env || (extra as { env?: QueryEnv })?.env || {};
			return gprofilerResponse(() => handler(args as Record<string, unknown>, runtimeEnv as Record<string, unknown>), runtimeEnv, name, extra, args);
		},
	);
}
