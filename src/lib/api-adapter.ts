import { type ApiFetchFn, commercialUseRefusal } from "@bio-mcp/shared/codemode/catalog";
import { gprofilerFetch } from "./http";
import { RELEASE, requestInput, VERSIONS } from "./input";
import { fail, hash, readJson } from "./response";

type Input = ReturnType<typeof requestInput>;
function queryOrder(data: unknown): string[] | undefined {
  if (!data || typeof data !== "object" || !("meta" in data) || !data.meta || typeof data.meta !== "object" || !("query_metadata" in data.meta)) return undefined;
  const metadata = data.meta.query_metadata;
  if (!metadata || typeof metadata !== "object" || !("queries" in metadata) || !metadata.queries || typeof metadata.queries !== "object" || Array.isArray(metadata.queries)) return undefined;
  return Object.keys(metadata.queries);
}
function observedVersion(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || !("gprofiler_version" in data)) return undefined;
  const value = data.gprofiler_version;
  return typeof value === "string" && RELEASE.test(value) ? value : undefined;
}
function checkVersion(input: Input, data: unknown): string {
  const version = observedVersion(data);
  const evidence = { metadata: data, expected_version: input.expectedVersion, archive: input.archive, incomplete: true };
  if (!version) fail("Selected release could not be verified from gprofiler_version", 502, evidence);
  if (input.expectedVersion && version !== input.expectedVersion) fail(`Expected ${input.expectedVersion}; provider reports ${version}`, 409, evidence);
  if (input.archive && version !== input.archive && !version.startsWith(`${input.archive}_`)) fail(`Archive ${input.archive} reports a different release: ${version}`, 409, evidence);
  return version;
}
async function metadata(input: Input, signal: AbortSignal): Promise<unknown> {
  return readJson(await gprofilerFetch(VERSIONS, { organism: input.organism }, { baseUrl: input.baseUrl, signal }));
}

/**
 * g:GOSt sources that a commercial product may serve (license audit 2026-11-10).
 * GO is CC BY 4.0, Reactome and WikiPathways are CC0, the Human Phenotype
 * Ontology permits commercial use with attribution, the Human Protein Atlas is
 * CC BY 4.0. Not in the list: KEGG and TF (TRANSFAC), whose licenses restrict
 * commercial use, and MIRNA (miRTarBase) and CORUM, whose terms for commercial
 * use are not confirmed. The g:Profiler terms of service permit commercial
 * work but say that "some sources restrict commercial use".
 */
export const COMMERCIAL_GOST_SOURCES: readonly string[] = ["GO:BP", "GO:MF", "GO:CC", "REAC", "WP", "HP", "HPA"];
const COMMERCIAL_GOST_ALLOWED = new Set(["GO", ...COMMERCIAL_GOST_SOURCES]);

type GprofilerRequest = Parameters<ApiFetchFn>[0];
const isGost = (path: string) => (path.endsWith("/") ? path : `${path}/`) === "/gost/profile/";

/**
 * Apply the commercial license profile to a g:GOSt request.
 *
 * With no `sources` the upstream default is every source, so the permitted
 * list becomes the explicit default; the response provenance shows it. A
 * request that names another source is refused: the caller asked for data that
 * this product does not serve, and a silent removal would look like "no
 * enrichment in KEGG". Every other route (g:Convert, g:Orth, g:SNPense, the
 * metadata routes) uses Ensembl data and is not changed.
 */
export function commercialGostRequest(request: GprofilerRequest): { request: GprofilerRequest } | { refusal: ReturnType<typeof commercialUseRefusal> } {
  const body = request.body;
  if (!isGost(request.path) || !body || typeof body !== "object" || Array.isArray(body)) return { request };
  const sources: unknown = Reflect.get(body, "sources");
  if (sources === undefined || (Array.isArray(sources) && sources.length === 0)) {
    return { request: { ...request, body: { ...body, sources: [...COMMERCIAL_GOST_SOURCES] } } };
  }
  // A value that is not a string array fails the input check that follows.
  if (!Array.isArray(sources) || !sources.every((item): item is string => typeof item === "string")) return { request };
  const refused = sources.filter((item) => !COMMERCIAL_GOST_ALLOWED.has(item.trim().toUpperCase()));
  if (refused.length === 0) return { request };
  return {
    refusal: commercialUseRefusal(
      `g:GOSt source ${refused.join(", ")}`,
      `the terms of that data source restrict commercial use or are not confirmed. Use sources from: ${COMMERCIAL_GOST_SOURCES.join(", ")}`,
    ),
  };
}

export function createGprofilerApiFetch(): ApiFetchFn {
  return async (incoming) => {
    const limited = incoming.licenseProfile === "commercial" ? commercialGostRequest(incoming) : { request: incoming };
    if ("refusal" in limited) return limited.refusal;
    const request = limited.request;
    const { input, version, analysisVersion, data, pinned, before, after, response } = await readVersionedAnalysis(request);
    const provenance = {
      source_url: `${input.baseUrl}${input.path}`,
      retrieved_at: new Date().toISOString(),
      archive_selected: input.archive ?? null,
      expected_version: input.expectedVersion ?? null,
      observed_version: version ?? null,
      analysis_version: analysisVersion ?? null,
      query_order: queryOrder(data),
      release_verification: pinned ? "metadata_checked" : input.path === VERSIONS && version ? "metadata_reported" : "not_checked",
      data_versions_before: before,
      data_versions_after: after,
      request: { method: input.method, params: input.params, body: input.body },
      request_sha256: await hash({ method: input.method, base_url: input.baseUrl, path: input.path, params: input.params, body: input.body }),
      ...(input.path === "/gost/profile/" ? { interpretation: input.body?.ordered === true
        ? "Ordered-list scores must not be interpreted as ordinary p-values; preserve optimal-prefix sizes and null intersections."
        : "Provider p_value values are already corrected; retain meta and requested background/correction settings." } : {}),
    };
    return { status: response.status, data: { ...(Array.isArray(data) ? { result: data } : data as object), _gprofiler: provenance } };
  };
}

async function readVersionedAnalysis(request: Parameters<ApiFetchFn>[0]) {
  const input = requestInput(request);
  const signal = AbortSignal.timeout(45000);
  const pinned = !!(input.archive || input.expectedVersion);
  const before = pinned && input.path !== VERSIONS ? await metadata(input, signal) : undefined;
  const beforeVersion = before ? checkVersion(input, before) : undefined;
  const response = await gprofilerFetch(input.path, input.params, { baseUrl: input.baseUrl, method: input.method, body: input.body, signal });
  const data = await readJson(response);
  let after: unknown;
  let version: string | undefined;
  try {
    after = pinned && input.path !== VERSIONS ? await metadata(input, signal) : undefined;
    const releaseData = input.path === VERSIONS ? data : after;
    version = pinned ? checkVersion(input, releaseData) : observedVersion(releaseData);
  } catch (error) {
    if (error instanceof Error) throw Object.assign(error, {
      data: {
        failure: "data" in error ? error.data : undefined, analysis: data, data_versions_before: before,
        data_versions_after: after, incomplete: true,
      }
    });
    throw error;
  }
  const analysisVersion = data && typeof data === "object" && "meta" in data && data.meta && typeof data.meta === "object" && "version" in data.meta
    ? data.meta.version : undefined;
  if ((beforeVersion && beforeVersion !== version) || (pinned && analysisVersion !== undefined && analysisVersion !== version)) {
    fail("g:Profiler release metadata and analysis version disagree", 409,
      { analysis: data, data_versions_before: before, data_versions_after: after, analysis_version: analysisVersion, incomplete: true });
  }
  return { input, version, analysisVersion, data, pinned, before, after, response };
}
