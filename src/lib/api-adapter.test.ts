import { afterEach, expect, it, vi } from "vitest";
import { createGprofilerApiFetch } from "./api-adapter";
import { readJson } from "./response";

const api = createGprofilerApiFetch();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const release = "e94_eg41_p11_abcdef12";
const versions = { gprofiler_version: release, sources: { GO: { version: "fixture-GO" }, KEGG: { version: "fixture-older-KEGG" } } };
const analysis = { method: "POST", path: "/gost/profile/", body: { organism: "hsapiens", query: ["TP53", "TP53", "BRCA1"] } };
function responses(...values: unknown[]) {
  const fetcher = vi.fn();
  for (const value of values) fetcher.mockResolvedValueOnce(value instanceof Response ? value : json(value));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

it("preserves complete ordered/named results, null intersections, correction and background", async () => {
  const body = { ...analysis.body, query: { first: ["TP53", "BRCA1"], second: ["MYC"] }, background: ["TP53", "BRCA1", "MYC"], domain_scope: "custom_annotated", significance_threshold_method: "fdr", ordered: true, combined: true, sources: [], numeric_ns: "ENTREZGENE", no_evidences: false };
  const raw = { result: [{ native: "GO:fixture", p_values: [0.01, 0.1], query_sizes: [1, 1], intersections: [["IEA"], null, []] }], meta: { genes_metadata: { query: { first: { ensgs: ["ENSG1", "ENSG2"] } } }, query_metadata: body } };
  const fetcher = responses(raw);
  expect(await api({ ...analysis, body })).toMatchObject({ data: { ...raw, _gprofiler: { observed_version: null, release_verification: "not_checked", request: { body }, request_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(body);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "manual", signal: expect.any(AbortSignal) });
});
it("lists organisms/namespaces with native boolean spelling and preserves arrays", async () => {
  const raw = [{ id: "hsapiens", namespaces: ["ENSG", "UNIPROT"] }];
  const fetcher = responses(raw);
  expect(await api({ method: "GET", path: "/util/organisms_list", params: { organism: "hsapiens", extra_data: true } })).toMatchObject({ data: { result: raw } });
  expect(String(fetcher.mock.calls[0][0])).toBe("https://biit.cs.ut.ee/gprofiler/api/util/organisms_list/?organism=hsapiens&extra_data=True");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", body: undefined });
});
it("retains nonalphabetic native query order as an explicit vector", async () => {
  responses({result: [{p_values: [0.1, 0.2]}], meta: {query_metadata: {queries: {zeta: ["TP53"], alpha: ["BRCA1"]}}}});
  expect(await api({...analysis, body: {...analysis.body, query: {zeta: ["TP53"], alpha: ["BRCA1"]}, combined: true}}))
    .toMatchObject({data: {_gprofiler: {query_order: ["zeta", "alpha"]}}});
});
it.each(["GET", "POST"])("discovers source versions using %s", async method => {
  const fetcher = responses(versions);
  expect(await api({ method, path: "/util/data_versions/", ...(method === "POST" ? { body: { organism: "mmusculus" } } : { params: { organism: "mmusculus" } }) })).toMatchObject({ data: { ...versions, _gprofiler: { observed_version: release, release_verification: "metadata_reported" } } });
  expect(fetcher.mock.calls[0][1].method).toBe(method);
});
it("pins all three requests to the selected archive and preserves source versions", async () => {
  const raw = { result: [{ incoming: "unknown", converted: "N/A" }], meta: {} };
  const fetcher = responses(versions, raw, versions);
  const result = await api({ method: "POST", path: "/convert/convert/", body: { organism: "hsapiens", query: ["unknown"] }, params: { archive: "e94_eg41_p11", expected_version: release } });
  expect(result).toMatchObject({ data: { ...raw, _gprofiler: { observed_version: release, data_versions_before: versions, data_versions_after: versions } } });
  for (const [url, options] of fetcher.mock.calls) {
    expect(String(url)).toMatch(/^https:\/\/biit.cs.ut.ee\/gprofiler_archive3\/e94_eg41_p11\/api\//);
    expect(String(url)).not.toContain("expected_version");
    expect(options.signal).toBe(fetcher.mock.calls[0][1].signal);
  }
  expect(fetcher.mock.calls[1][1].body).not.toContain("archive");
});
it("rejects a current release mismatch before sending genes", async () => {
  const fetcher = responses(versions);
  await expect(api({ ...analysis, params: { expected_version: "e114_eg62_p19_abcdef12" } })).rejects.toMatchObject({ status: 409 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("detects same-prefix archive drift between metadata checks", async () => {
  responses(versions, { result: [] }, { ...versions, gprofiler_version: "e94_eg41_p11_12345678" });
  await expect(api({ ...analysis, params: { archive: "e94_eg41_p11" } })).rejects.toMatchObject({ status: 409 });
});
it("rejects analysis versions that disagree with matching before/after metadata", async () => {
  const raw = { result: [{ native: "GO:fixture" }], meta: { version: "e95_eg41_p11_abcdef12" } };
  responses(versions, raw, versions);
  await expect(api({ ...analysis, params: { archive: "e94_eg41_p11" } })).rejects.toMatchObject({
    status: 409, data: { analysis: raw, data_versions_before: versions, data_versions_after: versions },
  });
});
it.each([{}, { gprofiler_version: "unknown" }, { gprofiler_version: "e95_eg41_p11" }])("fails unverified or mismatched archive metadata %#", async data => {
  const fetcher = responses(data);
  await expect(api({ ...analysis, params: { archive: "e94_eg41_p11" } })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not fall back when an archive is unavailable", async () => {
  const fetcher = responses(json({ message: "missing" }, 404));
  await expect(api({ ...analysis, params: { archive: "e94_eg41_p11" } })).rejects.toMatchObject({ status: 404 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  { method: "GET", path: "/gost/profile/" },
  { method: "DELETE", path: "/util/data_versions/" },
  { method: "GET", path: "https://evil.test/" },
  { method: "GET", path: "/util/archives/" },
  { ...analysis, params: { archive: "https://evil.test/" } },
  { ...analysis, params: { archive: "e93_eg40_p10" } },
  { ...analysis, params: { expected_version: "latest" } },
  { ...analysis, body: { query: ["TP53"], numeric_namespace: "ENTREZGENE" } },
  { ...analysis, body: { query: ["TP53"], archive: "e94_eg41_p11" } },
  { ...analysis, body: { query: ["TP53"], background: ["TP53"] } },
  { ...analysis, body: { query: ["TP53"], domain_scope: "custom" } },
  { ...analysis, body: { query: ["TP53"], significance_threshold_method: "BH" } },
  { ...analysis, body: { query: ["TP53"], ordered: "true" } },
  { ...analysis, body: { query: ["TP53"], user_threshold: 2 } },
  { ...analysis, body: { query: [] } },
  { ...analysis, body: { query: ["TP53"], organism: "../hsapiens" } },
  { ...analysis, body: { query: ["TP53"], output: "csv" } },
  { ...analysis, params: { organism: "mmusculus" } },
  { method: "GET", path: "/util/organisms_list/", params: { extra_data: "maybe" } },
  { method: "GET", path: "/util/data_versions/", body: {} },
])("rejects invalid requests before any fetch %#", async request => {
  const fetcher = responses();
  await expect(api(request)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it("bounds UTF-8 request bytes", async () => {
  const fetcher = responses();
  await expect(api({ ...analysis, body: { query: ["α".repeat(530_000)] } })).rejects.toThrow("1 MiB");
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([json({error: "invalid query"}), new Response("<html>failure</html>"), json(null), json(3)])("rejects malformed/error responses %#", async response => {
  await expect(readJson(response)).rejects.toMatchObject({ status: 502 });
});
it("bounds chunked UTF-8 responses and cancels remaining reads", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new TextEncoder().encode("α".repeat(530_000))); }, cancel });
  await expect(readJson(new Response(stream))).rejects.toThrow("2 MiB");
  expect(cancel).toHaveBeenCalled();
});
it("accepts provider array backgrounds and keeps duplicate identifiers", async () => {
  const fetcher = responses({ result: [] });
  await api({ ...analysis, body: { ...analysis.body, background: "AFFY_HG_U133A", domain_scope: "custom" } });
  expect(JSON.parse(fetcher.mock.calls[0][1].body).query).toEqual(analysis.body.query);
});
