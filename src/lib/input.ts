import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { fail } from "./response";

export const RELEASE = /^e(\d+)_eg\d+_p\d+(?:_[a-f0-9]{6,64})?$/;
const ANALYSIS = new Set(["/gost/profile/", "/convert/convert/", "/orth/orth/", "/snpense/snpense/"]);
export const VERSIONS = "/util/data_versions/";
const ORGANISMS = "/util/organisms_list/";
const FLAGS = ["ordered", "combined", "all_results", "measure_underrepresentation", "no_iea", "no_evidences", "highlight"];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Expected a JSON object");
  return value as Record<string, unknown>;
}
function strings(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => typeof item === "string" && item.trim().length > 0);
}
function geneQuery(value: unknown, named: boolean): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0 && strings(value);
  return named && !!value && typeof value === "object" && Object.keys(value).length > 0 &&
    Object.values(value).every(item => Array.isArray(item) && item.length > 0 && strings(item));
}
function profileSettings(body: Record<string, unknown>): void {
  for (const field of FLAGS) if (body[field] !== undefined && typeof body[field] !== "boolean") fail(`${field} must be boolean`);
  if (body.sources !== undefined && !strings(body.sources)) fail("sources must be a string array");
  if (body.user_threshold !== undefined && (typeof body.user_threshold !== "number" || !Number.isFinite(body.user_threshold) || body.user_threshold < 0 || body.user_threshold > 1)) fail("user_threshold must be between 0 and 1");
  if (body.domain_scope !== undefined && !["annotated", "known", "custom", "custom_annotated"].includes(String(body.domain_scope))) fail("Invalid domain_scope");
  if (body.significance_threshold_method !== undefined && !["g_SCS", "bonferroni", "fdr"].includes(String(body.significance_threshold_method))) fail("Invalid significance_threshold_method");
  const custom = body.domain_scope === "custom" || body.domain_scope === "custom_annotated";
  if (custom && !geneQuery(body.background, false)) fail("Custom domain_scope requires a nonempty background");
  if (!custom && body.background !== undefined) fail("background requires domain_scope custom or custom_annotated");
}
function analysisBody(path: string, value: unknown): Record<string, unknown> {
  const body = record(value);
  const profile = path === "/gost/profile/";
  const fields = ["organism", "query", "output", ...(profile ? [...FLAGS, "sources", "user_threshold", "domain_scope", "background", "numeric_ns", "significance_threshold_method"] : path === "/snpense/snpense/" ? [] : ["target", "numeric_ns"])];
  for (const key of Object.keys(body)) if (!fields.includes(key)) fail(`Unsupported body field ${key}; use numeric_ns for numeric identifiers and the params argument for archive/expected_version`);
  if (!geneQuery(body.query, profile)) fail("query must be a nonempty gene string/list, or named lists for g:GOSt");
  for (const key of ["target", "numeric_ns"]) if (body[key] !== undefined && (typeof body[key] !== "string" || !body[key].trim())) fail(`${key} must be a nonempty string`);
  if (path === "/orth/orth/" && !body.target) fail("g:Orth requires a target organism");
  if (body.output !== undefined && body.output !== "json") fail("Only JSON output is supported");
  if (profile) profileSettings(body);
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 1024 * 1024) fail("Request exceeds 1 MiB");
  return body;
}
function release(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !RELEASE.test(value)) fail(`${name} must be a g:Profiler release ID, not a URL`);
  if (name === "archive" && Number(RELEASE.exec(value)?.[1]) < 94) fail("Archive API selection requires Ensembl 94 or later");
  return value;
}

export function requestInput(request: Parameters<ApiFetchFn>[0]) {
  const path = request.path.endsWith("/") ? request.path : `${request.path}/`;
  const analysis = ANALYSIS.has(path);
  if (!analysis && path !== VERSIONS && path !== ORGANISMS) fail("Unsupported g:Profiler endpoint", 404);
  const method = request.method.toUpperCase();
  if (analysis ? method !== "POST" : method !== "GET" && !(path === VERSIONS && method === "POST")) fail("Unsupported HTTP method", 405);
  if (method === "GET" && request.body !== undefined) fail("GET requests cannot have a body");
  const supplied = request.params ?? {};
  const archive = release(supplied.archive, "archive");
  const expectedVersion = release(supplied.expected_version, "expected_version");
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(supplied)) {
    if (key === "archive" || key === "expected_version") continue;
    if (analysis || method === "POST" || !["organism", ...(path === ORGANISMS ? ["extra_data"] : [])].includes(key)) fail(`Unsupported query parameter ${key}`);
    params[key] = value;
  }
  const body = analysis ? analysisBody(path, request.body) : method === "POST" ? record(request.body) : undefined;
  if (!analysis && body && Object.keys(body).some(key => key !== "organism")) fail("data_versions body accepts only organism");
  const organism = body?.organism ?? params.organism ?? "hsapiens";
  if (typeof organism !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(organism)) fail("Invalid organism ID");
  if (path === VERSIONS && !body) params.organism = organism;
  if (params.extra_data !== undefined) {
    const value = params.extra_data;
    if (![true, false, "True", "False", "true", "false"].includes(value as string | boolean)) fail("extra_data must be boolean");
    params.extra_data = value === true || value === "True" || value === "true" ? "True" : "False";
  }
  return { path, method, body, params, organism, archive, expectedVersion,
    baseUrl: archive ? `https://biit.cs.ut.ee/gprofiler_archive3/${archive}/api` : "https://biit.cs.ut.ee/gprofiler/api" };
}
