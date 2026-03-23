import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { gprofilerCatalog } from "../spec/catalog";
import { createGprofilerApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
	GPROFILER_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
	server: McpServer,
	env: CodeModeEnv,
) {
	const apiFetch = createGprofilerApiFetch();

	const searchTool = createSearchTool({
		prefix: "gprofiler",
		catalog: gprofilerCatalog,
	});
	searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

	const executeTool = createExecuteTool({
		prefix: "gprofiler",
		catalog: gprofilerCatalog,
		apiFetch,
		doNamespace: env.GPROFILER_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
