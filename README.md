# Gprofiler MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream Gprofiler API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

The configured production endpoint is:

```
https://gprofiler-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "gprofiler": {
      "command": "npx",
      "args": ["mcp-remote", "https://gprofiler-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8855/mcp` (start it with `./scripts/dev-servers.sh gprofiler`):

```json
{
  "mcpServers": {
    "gprofiler-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8855/mcp"]
    }
  }
}
```

## Tools

- `gprofiler_search` — discover available API operations (Code Mode catalog search, 7 method/path operations)
- `gprofiler_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `gprofiler_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `gprofiler_get_schema` — inspect the inferred schema of a staged dataset

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL.

Every tool also has an `mcp_gprofiler_*` alias. Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.

## Development

```bash
./scripts/dev-servers.sh gprofiler            # run locally (port 8855)
pnpm --filter gprofiler-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

## Release discovery and reproducible analysis

Use `GET /util/organisms_list/` with optional `organism` and `extra_data: true` for organism/namespace discovery. `GET /util/data_versions/` (or the official R client's POST form) reports `gprofiler_version` and individual source versions. Discover availability at runtime: sources differ across organisms and may come from different release dates. The catalog no longer labels the current service `r2024_01`.

```javascript
const versions = await api.get("/util/data_versions/", {organism: "hsapiens"});
if (!versions.gprofiler_version) return versions; // preserve a staging/error handle
return await api.post("/gost/profile/", {
  organism: "hsapiens", query: ["TP53", "BRCA1"],
  significance_threshold_method: "fdr", sources: ["GO:BP"]
}, {expected_version: versions.gprofiler_version});
```

Adapter-only `archive` and `expected_version` belong in the params argument (third argument to `api.post`), not the provider JSON body. `archive` accepts an archive3 identifier from Ensembl 94 onward, optionally including its build hash. The recipe uses `e113_eg59_p19`, natively verified on October 4 with exact version `e113_eg59_p19_903d2221`; it rechecks metadata each time. The older `e94_eg41_p11` serves native analyses but returns 404 for release metadata, so this adapter rejects it as unverifiable. Inspect an archive's data versions first, then use its exact `gprofiler_version` as `expected_version`. Unsupported/missing metadata, archive mismatch and observed drift fail explicitly without fallback to current. No undocumented archive-list endpoint is assumed.

Pinned analyses check metadata on the selected base before and after execution, and reject disagreement with a reported analysis `meta.version`. These checks detect observed drift, not an atomic snapshot guarantee. Unpinned current analyses keep working without a metadata preflight; `_gprofiler.release_verification` then says `not_checked`, while `analysis_version` retains any version reported by the analysis itself. `_gprofiler` records the selected archive, observed version when available, source URL, retrieval time, request/hash and pinned source metadata. Native `meta` and results remain intact; top-level provider arrays are wrapped in `result`.

The catalog exposes `domain_scope`, custom `background`, native `numeric_ns`, correction, evidence and named/combined query controls. A background requires `custom` or `custom_annotated`; custom scopes require a nonempty background. Ordinary provider `p_value` values are already corrected. Ordered-list scores must not be interpreted as ordinary p-values: retain optimal-prefix sizes, gene order, and the distinction between null and empty intersections. Preserve unmapped identifiers and combined per-query arrays. `api.post` returns the API object directly, not a `.data` wrapper.

Combined results omit intersections/evidence codes; use `combined: false` when those are needed. `_gprofiler.query_order` preserves native query names as a vector so combined scores remain interpretable even when JSON object keys are canonicalized later. SQL exposes `enriched_terms`, `converted_ids`, `orthologs`, `snp_mappings` or `organisms`, plus `response_context`, `query_metadata`, `gene_queries`, `source_statistics` and `source_versions` when present. Each native row remains available as `native_json`; full original responses remain in `payloads`. Keep score vectors and gene order intact instead of expanding them into a cross-product.

Each adapter request has a shared 45-second deadline, an independent 15-second body deadline, a 1 MiB JSON-body limit and a 2 MiB decoded-response limit. Larger analyses need narrower queries. Partial or invalid UTF-8/JSON responses fail explicitly; bounded HTTP error text and problem fields remain complete. All eight aliases carry canonical citations and stage composed responses above 30 KiB. Redirects are rejected so an archive cannot silently redirect to current.

Provider references: [API](https://biit.cs.ut.ee/gprofiler/page/apis), [release news](https://biit.cs.ut.ee/gprofiler/page/news), [archives](https://biit.cs.ut.ee/gprofiler/page/archives), [official R client archive configuration](https://raw.githubusercontent.com/cran/gprofiler2/master/R/gprofiler2.R), [ordered-query interpretation](https://biit.cs.ut.ee/gprofiler/page/docs).

## Validation status (2026-09-28)

October 4 native/local acceptance passed **1,133 MCP calls**, including all four recipes, current and Ensembl 113 archive metadata, conversion, orthology, SNP mappings and full native errors. SQL and full payload recovery matched three 739-term custom-background responses, 180 combined ordered terms and 57 standard terms. An ordered evidence response preserved 19 null intersections across 12 terms. Nonalphabetic query order survived composed staging. Native response comparisons exclude only request-specific `meta.timestamp`; each actual complete payload's canonical hash is verified.

**54 focused tests and 203 catalog checks**, direct TypeScript/lint, dry bundle and the local contract harness pass. Full repository and affected-workspace results are recorded in the [verification receipt](../../scratch/2026-10-04-gprofiler/verification.json). Native mid-request drift, all archive availability and immutable snapshots remain unverified. No deployment was performed.

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from g:Profiler and stays under the terms of that source: g:Profiler terms permit commercial work; KEGG and TRANSFAC terms are restricted by their own licenses.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
