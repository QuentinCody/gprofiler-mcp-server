import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMERCIAL_GOST_SOURCES, commercialGostRequest, createGprofilerApiFetch } from "./api-adapter";

// License audit 2026-11-10: the g:Profiler terms of service permit commercial
// work, but "some sources restrict commercial use". KEGG and TRANSFAC (TF) are
// restricted by their own licenses; the terms of miRTarBase (MIRNA) and CORUM for
// commercial use are not confirmed. A reselling caller gets enrichment from the
// open sources only.
describe("g:Profiler adapter under the commercial license profile", () => {
	afterEach(() => vi.unstubAllGlobals());

	const profile = { method: "POST", path: "/gost/profile/", licenseProfile: "commercial" as const };
	const query = { organism: "hsapiens", query: ["TP53", "BRCA1"] };

	function stubUpstream() {
		const bodies: unknown[] = [];
		vi.stubGlobal("fetch", async (_url: string, init?: { body?: string }) => {
			bodies.push(init?.body ? JSON.parse(init.body) : undefined);
			return new Response(JSON.stringify({ result: [], meta: {} }), { status: 200 });
		});
		return bodies;
	}

	it("refuses KEGG, TF, MIRNA and CORUM with HTTP 451 and makes no upstream request", async () => {
		const bodies = stubUpstream();
		const api = createGprofilerApiFetch();
		for (const source of ["KEGG", "TF", "MIRNA", "CORUM", "kegg"]) {
			const result = await api({ ...profile, body: { ...query, sources: ["GO:BP", source] } });
			expect(result.status, source).toBe(451);
			expect(result.data).toMatchObject({ error: "NOT_LICENSED_FOR_COMMERCIAL_USE" });
			expect(JSON.stringify(result.data)).toContain(source);
		}
		expect(bodies).toEqual([]);
	});

	it("makes the permitted list the explicit default when the request names no source", async () => {
		const bodies = stubUpstream();
		const api = createGprofilerApiFetch();
		for (const body of [query, { ...query, sources: [] }]) {
			const result = await api({ ...profile, body });
			expect(result.status).toBe(200);
			// The provenance of the result shows the sources that were sent.
			expect(result.data).toMatchObject({ _gprofiler: { request: { body: { sources: COMMERCIAL_GOST_SOURCES } } } });
		}
		expect(bodies).toEqual([
			{ ...query, sources: COMMERCIAL_GOST_SOURCES },
			{ ...query, sources: COMMERCIAL_GOST_SOURCES },
		]);
	});

	it("sends a request for permitted sources without a change", async () => {
		const bodies = stubUpstream();
		const body = { ...query, sources: ["GO:BP", "REAC", "WP", "HP", "HPA", "GO"] };
		expect((await createGprofilerApiFetch()({ ...profile, body })).status).toBe(200);
		expect(bodies).toEqual([body]);
	});

	it("does not change a caller without the commercial profile, also for KEGG", async () => {
		const bodies = stubUpstream();
		const api = createGprofilerApiFetch();
		expect((await api({ method: "POST", path: "/gost/profile/", body: query })).status).toBe(200);
		expect((await api({ method: "POST", path: "/gost/profile/", body: { ...query, sources: ["KEGG", "TF"] } })).status).toBe(200);
		expect(bodies).toEqual([query, { ...query, sources: ["KEGG", "TF"] }]);
	});

	it("does not change the other routes", () => {
		const convert = { method: "POST", path: "/convert/convert/", body: { ...query, target: "ENSG" }, licenseProfile: "commercial" as const };
		expect(commercialGostRequest(convert)).toEqual({ request: convert });
		const versions = { method: "GET", path: "/util/data_versions/", licenseProfile: "commercial" as const };
		expect(commercialGostRequest(versions)).toEqual({ request: versions });
	});

	it("applies to the route without its final slash too", () => {
		const result = commercialGostRequest({ ...profile, path: "/gost/profile", body: { ...query, sources: ["KEGG"] } });
		expect("refusal" in result).toBe(true);
	});

	it("leaves a malformed `sources` value to the input check", async () => {
		stubUpstream();
		await expect(createGprofilerApiFetch()({ ...profile, body: { ...query, sources: "KEGG" } })).rejects.toThrow(/sources must be a string array/);
	});
});
