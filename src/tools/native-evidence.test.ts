import { verifyCitationEnvelope } from "@bio-mcp/shared";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));

import { fixture, recover } from "./staging-fixture";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function invoke(f: ReturnType<typeof fixture>, name: string, args: Record<string, unknown>, failed = false) {
  const result = await f.tools[name].handler(args, {});
  expect(result.isError === true, JSON.stringify(result).slice(0, 500)).toBe(failed);
  expect(result.content.length).toBeGreaterThan(0);
  const sc = result.structuredContent;
  const id = sc.staged ? sc.data_access_id : sc.data?.__staged ? sc.data.data_access_id : undefined;
  const staged = id ? await recover(f, id, "") : undefined;
  const proof = await verifyCitationEnvelope({ citation: sc._meta?.citation, structuredContent: sc, toolArguments: args,
    ...(staged ? { materialized: { value: staged } } : {}) });
  expect(proof.verification).toMatchObject({ query: "verified", result: "verified" });
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(30720);
  return { sc, id, data: sc.staged ? staged.structuredContent.data : sc.data?.__staged ? staged : sc.data };
}

it.each(["", "mcp_"])("verifies all %s aliases, argument hashes and error envelopes", async prefix => {
  const f = fixture();
  try {
    await invoke(f, `${prefix}gprofiler_search`, { query: "enrichment" });
    await invoke(f, `${prefix}gprofiler_execute`, { code: "return {value:'001'};" });
    await invoke(f, `${prefix}gprofiler_execute`, { code: "" }, true);
    await invoke(f, `${prefix}gprofiler_query_data`, { data_access_id: "missing", sql: "SELECT * FROM missing" }, true);
    await invoke(f, `${prefix}gprofiler_get_schema`, { data_access_id: "missing" });
  } finally { f.close(); }
});

it("preserves combined vectors, exact strings and complete source/query context in SQLite", async () => {
  const f = fixture();
  const records = Array.from({length: 60}, (_, i) => ({native: `GO:${i}`, source: "GO:BP", name: "α😀".repeat(100), p_values: [1e-30, 0.01], query_sizes: [1, 2], intersections: [null, [], ["IEA"]], code: "001", future: "9007199254740993"}));
  const raw = {result: records, meta: {version: "e114_eg62_p19_27110d83", query_metadata: {ordered: true, combined: true, significance_threshold_method: "fdr"}, genes_metadata: {query: {first: {ensgs: ["ENSG1", "ENSG2"]}}, failed: ["unmapped"], duplicates: ["TP53"]}, result_metadata: {"GO:BP": {domain_size: 2000, threshold: null}}}};
  vi.stubGlobal("fetch", async () => Response.json(raw));
  try {
    const result = await invoke(f, "gprofiler_execute", {code: 'return await api.post("/gost/profile/",{organism:"hsapiens",query:["TP53"],ordered:true});'});
    expect(result.id).toBeTruthy(); expect(result.data.result).toEqual(records); expect(result.data.meta).toEqual(raw.meta);
    const queried = await invoke(f, "mcp_gprofiler_query_data", {data_access_id: result.id, sql: "SELECT native_json,code,future,typeof(code) AS kind FROM enriched_terms ORDER BY result_index LIMIT 1"});
    expect(JSON.parse(queried.data.rows[0].native_json)).toEqual(records[0]);
    expect(queried.data.rows[0]).toMatchObject({code: "001", future: "9007199254740993", kind: "text"});
    const context = await invoke(f, "gprofiler_query_data", {data_access_id: result.id, sql: "SELECT native_json FROM response_context"});
    expect(JSON.parse(context.data.rows[0].native_json).meta).toEqual(raw.meta);
    const genes = await invoke(f, "gprofiler_query_data", {data_access_id: result.id, sql: "SELECT query_name,native_json FROM gene_queries"});
    expect(genes.data.rows).toEqual([{query_name: "first", native_json: JSON.stringify(raw.meta.genes_metadata.query.first)}]);
  } finally {f.close();}
});

it("keeps whole provider errors and composed results with canonical proofs", async () => {
  const f = fixture(); const problem = {message: "α".repeat(30000), future: {code: "001", reason: null}};
  try {
    vi.stubGlobal("fetch", async () => Response.json(problem, {status: 400}));
    const result = await invoke(f, "gprofiler_execute", {code: 'return await api.post("/gost/profile/",{query:["TP53"]});'}, true);
    const evidence = result.data.data.__staged ? await recover(f, result.data.data.data_access_id, "") : result.data.data;
    expect(evidence.problem).toEqual(problem); expect(JSON.parse(evidence.response)).toEqual(problem);
    const composed = await invoke(f, "mcp_gprofiler_execute", {code: 'return {notes:"α😀".repeat(12000),values:[0,null,"001"]};'});
    expect(composed.sc.staged).toBe(true); expect(composed.data.notes).toBe("α😀".repeat(12000));
  } finally {f.close();}
});
