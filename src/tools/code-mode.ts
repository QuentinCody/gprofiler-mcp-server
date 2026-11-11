import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import type { McpServer } from "@bio-mcp/shared/mcp";
import { createGprofilerApiFetch } from "../lib/api-adapter";
import { gprofilerResponse } from "../lib/tool-result";
import { gprofilerCatalog } from "../spec/catalog";

interface CodeModeEnv {
	GPROFILER_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
	server: McpServer,
	env: CodeModeEnv,
): void {
	const apiFetch = createGprofilerApiFetch();
  const registrar = { tool: (...args: unknown[]) => {
    const [name, ...rest] = args;
    const handler = rest.pop() as (args: unknown, extra: unknown) => ReturnType<Parameters<typeof gprofilerResponse>[0]>;
    const respond = (args: unknown, extra: unknown) => gprofilerResponse(() => handler(args, extra), env, String(name), extra, args);
    const register = server.tool.bind(server) as (...values: unknown[]) => void;
    register(name, ...rest, respond);
    register(`mcp_${String(name)}`, ...rest, respond);
  } };

	const searchTool = createSearchTool({
		prefix: "gprofiler",
		catalog: gprofilerCatalog,
	});
	searchTool.register(registrar);

	const executeTool = createExecuteTool({
		prefix: "gprofiler",
		// Verifiable provenance: gprofiler_execute results carry a _meta.citation.
		source: { id: "gprofiler", name: "g:Profiler", url: "https://biit.cs.ut.ee/gprofiler" },
		catalog: gprofilerCatalog,
		apiFetch,
    preserveApiErrors: true,
    stagingThreshold: 30 * 1024,
    maxInlineBytes: 30 * 1024,
    timeout: 90_000,
		doNamespace: env.GPROFILER_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(registrar);
}
