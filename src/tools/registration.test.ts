import { McpServer } from "@bio-mcp/shared/mcp";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { afterEach, expect, it, vi } from "vitest";
import { createGprofilerApiFetch } from "../lib/api-adapter";
import { gprofilerCatalog } from "../spec/catalog";
import { registerCodeMode } from "./code-mode";
import { registerGetSchema } from "./get-schema";
import { registerQueryData } from "./query-data";

const json = (data: unknown) => new Response(JSON.stringify(data));
afterEach(() => vi.unstubAllGlobals());
it("registers both aliases and discovers release discovery with both-fields contracts", async () => {
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  for (const name of ["gprofiler_search", "gprofiler_execute", "gprofiler_query_data", "gprofiler_get_schema"]) {
    expect(tools[name]).toBeDefined(); expect(tools[`mcp_${name}`]).toBeDefined();
  }
  const result = await tools.mcp_gprofiler_search.handler({ query: "Discover organisms, namespaces and source versions", category: "workflows", max_results: 5 }, {});
  expect(result).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
  expect(JSON.stringify(result)).toContain("data_versions");
  expect(await tools.mcp_gprofiler_query_data.handler({ data_access_id: "gprofiler_fixture", sql: "SELECT 1" }, {})).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: expect.any(Object) });
  expect(gprofilerCatalog.endpointCount).toBe(gprofilerCatalog.endpoints.length);
});
it("stages full results, source metadata and request settings above 30 KiB", async () => {
  const raw = { result: [{ native: "GO:fixture", description: "α".repeat(17_000), intersections: [null, [], ["IEA"]] }], meta: { query_metadata: { significance_threshold_method: "fdr" } } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(raw)));
  const stored: unknown[] = [];
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as { data: unknown }).data);
      return json({ success: true, tables_created: ["result"], total_rows: 1, input_rows: 1, table_row_counts: { result: 1 } });
    }
    return json({ success: true, schema: { tables: { result: { columns: [{ name: "native" }] } } } });
  } }) } as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({ apiFetch: createGprofilerApiFetch(), catalog: gprofilerCatalog, doNamespace: namespace, stagingPrefix: "gprofiler", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ method: "POST", path: "/gost/profile/", body: { query: ["TP53"], significance_threshold_method: "fdr" } }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, data_access_id: expect.any(String) });
  expect(JSON.parse(stored[0] as string)).toMatchObject({ ...raw, _gprofiler: { request: { body: { significance_threshold_method: "fdr" } } } });
  expect(stored[1]).toMatchObject(raw);
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30_000);
});
it.each([{ __api_error: true, status: 409 }, { __staged: true, data_access_id: "gprofiler_fixture" }, { __stage_error: true, message: "staging unavailable" }])("recipes retain error and staging handles %#", async handle => {
  for (const workflow of gprofilerCatalog.workflows!) {
    const run = new Function("api", `return (async () => { ${workflow.code} })()`);
    const result = await run({ get: vi.fn().mockResolvedValue(handle), post: vi.fn().mockResolvedValue(handle) });
    expect(result).toEqual(workflow.title.startsWith("Discover") ? { organisms: handle, versions: handle } : handle);
  }
});
it("release mismatch survives canonical proxy error handling", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ gprofiler_version: "e94_eg41_p11_abcdef12" })));
  const proxy = createApiProxyTool({ apiFetch: createGprofilerApiFetch(), catalog: gprofilerCatalog, stagingPrefix: "gprofiler", maxInlineBytes: 30 * 1024 });
  expect(await proxy.handler({ method: "POST", path: "/convert/convert/", body: { query: ["TP53"] }, params: { expected_version: "e114_eg62_p19_abcdef12" } }, { sql: () => [] })).toMatchObject({ __api_error: true, status: 409, incomplete: true });
});
