import type { ApiEndpoint, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";

export const controls = [
  { name: "archive", type: "string" as const, required: false, description: "Adapter-only archive3 release ID, e.g. e113_eg59_p19. Requires working data_versions metadata; the older e94_eg41_p11 analysis API works but lacks this metadata. No current-release fallback." },
  { name: "expected_version", type: "string" as const, required: false, description: "Adapter-only exact gprofiler_version observed from data_versions. Mismatch or unavailable metadata fails the request." },
];
export const discoveryEndpoints: ApiEndpoint[] = [
  { method: "GET", path: "/util/organisms_list/", category: "discovery", featured: true,
    summary: "Discover organisms and optionally available identifier namespaces.",
    queryParams: [...controls,
      { name: "organism", type: "string", required: false, description: "Filter to an organism; omit to list all." },
      { name: "extra_data", type: "boolean", required: false, description: "Include namespace metadata." }],
    example: 'return await api.get("/util/organisms_list/", {organism: "hsapiens", extra_data: true});' },
  { method: "GET", path: "/util/data_versions/", category: "discovery", featured: true,
    summary: "Get gprofiler_version and organism-specific source releases/dates.",
    queryParams: [...controls, { name: "organism", type: "string", required: false, default: "hsapiens", description: "Organism whose source versions to inspect." }],
    example: 'return await api.get("/util/data_versions/", {organism: "hsapiens"});' },
  { method: "POST", path: "/util/data_versions/", category: "discovery",
    summary: "Data versions using the official R client's POST form.", queryParams: controls,
    body: {contentType: "application/json", description: 'JSON body {"organism":"hsapiens"}; archive/expected_version go in third api.post argument.'},
    example: 'return await api.post("/util/data_versions/", {organism: "hsapiens"});' },
];

export const workflows: WorkflowRecipe[] = [
  { title: "Discover organisms, namespaces and source versions", keywords: ["organism", "namespace", "release", "version"],
    description: "Inspect source metadata before selecting identifiers. Each result may be a staging handle; preserve it.",
    code: 'return {organisms: await api.get("/util/organisms_list/", {organism: "hsapiens", extra_data: true}), versions: await api.get("/util/data_versions/", {organism: "hsapiens"})};' },
  { title: "Verify an archived release before conversion", keywords: ["archive", "release", "reproducibility"],
    description: "Rechecks a natively verified archive at runtime. If metadata stages, inspect it with query_data then run conversion with its exact gprofiler_version. Older archives without data_versions fail explicitly. No native archive-list endpoint is assumed.",
    code: `const archive = "e113_eg59_p19";
const versions = await api.get("/util/data_versions/", {organism: "hsapiens", archive});
if (!versions.gprofiler_version) return versions;
return await api.post("/convert/convert/", {organism: "hsapiens", query: ["TP53", "BRCA1"], target: "ENSG"}, {archive, expected_version: versions.gprofiler_version});` },
  { title: "Custom-background enrichment with explicit correction", keywords: ["background", "correction", "fdr", "enrichment"],
    description: "Replace the toy background with the complete measured gene universe; preserve metadata and already-corrected p-values.",
    code: 'return await api.post("/gost/profile/", {organism: "hsapiens", query: ["TP53", "BRCA1"], background: ["TP53", "BRCA1", "EGFR", "MYC", "PTEN"], domain_scope: "custom_annotated", significance_threshold_method: "fdr", sources: ["GO:BP"], no_evidences: false});' },
  { title: "Named ordered gene lists", keywords: ["ordered", "combined", "ranked", "multiple"],
    description: "Preserve list order, combined per-query arrays, optimal-prefix sizes and null intersections. Ordered scores are not ordinary p-values.",
    code: 'return await api.post("/gost/profile/", {organism: "hsapiens", query: {first: ["TP53", "EGFR", "BRCA1"], second: ["MYC", "PTEN"]}, ordered: true, combined: true, significance_threshold_method: "g_SCS"});' },
];
