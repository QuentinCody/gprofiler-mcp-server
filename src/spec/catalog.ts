import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { controls, discoveryEndpoints, workflows } from "./discovery";

export const gprofilerCatalog: ApiCatalog = {
	name: "g:Profiler",
	baseUrl: "https://biit.cs.ut.ee/gprofiler/api",
  version: "runtime data_versions (current or selected archive)",
  auth: "none",
  endpointCount: 7,
  workflows,
  notes:
    "Analysis uses api.post(path, body, params); discovery uses api.get. " +
    "Adapter-only params archive and expected_version select/verify a release; never put them in the native JSON body. " +
    "archive accepts an archive3 release identifier (Ensembl 94 onward), not a URL. Availability must be verified; no fallback to current. " +
    "Discover organisms/namespaces and source versions at runtime. Source coverage and dates vary by organism and release. " +
    "Return the complete API object, including meta and _gprofiler, or the staging handle; api.post does not return a .data wrapper. " +
    "Pinned requests compare data_versions before/after and any analysis meta.version; this detects observed drift but is not a transactional snapshot guarantee. Archives without verifiable metadata fail even when their analysis endpoint is reachable. " +
    "Arrays from discovery are wrapped in result. Keep combined arrays, unmapped identifiers and gene/intersection order intact; _gprofiler.query_order records native query names in vector order even when JSON object keys are later canonicalized. " +
    "Free University of Tartu service; large responses stage above 30 KiB. No bulk scraping or unbounded loops.",
	endpoints: [
    ...discoveryEndpoints,
		{
			method: "POST",
      queryParams: controls,
			path: "/gost/profile/",
			summary:
				"Gene set enrichment analysis (g:GOSt). Submit a list of genes and get enriched biological terms from GO, KEGG, Reactome, WikiPathways, TRANSFAC, miRTarBase, HPA, CORUM, and HP ontologies.",
			description:
				"JSON body fields:\n" +
				"- organism (string, required): Organism ID, e.g. 'hsapiens', 'mmusculus'. Default: 'hsapiens'\n" +
				"- query (string[] or named dictionary of string[], required): Gene identifiers; preserve order for ordered queries\n" +
        "- domain_scope: annotated, known, custom or custom_annotated; custom scopes require background (gene list or provider array identifier)\n" +
        "- significance_threshold_method: g_SCS, bonferroni or fdr; native p_value is already corrected\n" +
        "- numeric_ns: namespace for numeric IDs; combined, measure_underrepresentation, no_evidences and highlight are optional booleans\n" +
        "- Ordered output scores must not be treated as ordinary p-values. Keep optimal query_size and null intersections alongside meta.genes_metadata\n" +
        "- combined=true returns per-query arrays and omits intersections/evidence codes; use combined=false for ordered evidence alignment\n" +
				"- sources (string[], optional): Filter to specific sources: GO:BP, GO:MF, GO:CC, KEGG, REAC, WP, TF, MIRNA, HPA, CORUM, HP. Omit for all.\n" +
				"- all_results (boolean, optional): Include non-significant results (default: false)\n" +
				"- ordered (boolean, optional): Treat as ordered list for rank-based enrichment (default: false)\n" +
				"- user_threshold (number, optional): Significance threshold (default: 0.05)\n" +
				"- no_iea (boolean, optional): Exclude electronic GO annotations (default: false)\n" +
				"Returns: {result: [{source, native, name, p_value, description, term_size, query_size, intersection_size, precision, recall, significant, ...}], meta: {...}}",
			category: "enrichment",
			body: {
				contentType: "application/json",
				description:
					'{"organism": "hsapiens", "query": ["TP53", "BRCA1", "EGFR"], "sources": ["GO:BP", "KEGG", "REAC"]}',
			},
			example:
				'const result = await api.post("/gost/profile/", {\n' +
				'  organism: "hsapiens",\n' +
				'  query: ["TP53", "BRCA1", "EGFR", "MYC", "PTEN"],\n' +
				'  sources: ["GO:BP", "KEGG", "REAC"]\n' +
				"});\n" +
				"return result;",
		},
		{
			method: "POST",
      queryParams: controls,
			path: "/convert/convert/",
			summary:
				"Gene ID conversion (g:Convert). Convert gene identifiers between namespaces — Ensembl, UniProt, NCBI Entrez, RefSeq, HGNC, etc.",
			description:
				"JSON body fields:\n" +
				"- organism (string, required): Organism ID, e.g. 'hsapiens'\n" +
				"- query (string[], required): IDs to convert\n" +
				"- target (string, optional): Target namespace — ENSG, ENSP, ENST, UNIPROT, ENTREZGENE, HGNC, REFSEQ, WIKIGENE. Default: ENSG\n" +
				"- numeric_ns (string, optional): Namespace hint for bare numeric IDs (e.g. 'ENTREZGENE')\n" +
				"Returns: {result: [{incoming, converted, name, description, namespaces, n_incoming, n_converted, query}], meta: {...}}",
			category: "conversion",
			body: {
				contentType: "application/json",
				description:
					'{"organism": "hsapiens", "query": ["TP53", "BRCA1"], "target": "UNIPROT"}',
			},
			example:
				'const result = await api.post("/convert/convert/", {\n' +
				'  organism: "hsapiens",\n' +
				'  query: ["TP53", "BRCA1", "ENSG00000141510"],\n' +
				'  target: "UNIPROT"\n' +
				"});\n" +
				"return result;",
		},
		{
			method: "POST",
      queryParams: controls,
			path: "/orth/orth/",
			summary:
				"Ortholog mapping (g:Orth). Map genes from one species to orthologs in another using Ensembl orthology data.",
			description:
				"JSON body fields:\n" +
				"- organism (string, required): Source organism, e.g. 'hsapiens'\n" +
				"- query (string[], required): Gene IDs in the source organism\n" +
				"- target (string, required): Target organism, e.g. 'mmusculus', 'rnorvegicus', 'dmelanogaster'\n" +
				"Returns: {result: [{incoming, converted, name, description, ortholog_ensg, n_result, query}], meta: {...}}",
			category: "orthologs",
			body: {
				contentType: "application/json",
				description:
					'{"organism": "hsapiens", "query": ["TP53", "BRCA1"], "target": "mmusculus"}',
			},
			example:
				'const result = await api.post("/orth/orth/", {\n' +
				'  organism: "hsapiens",\n' +
				'  query: ["TP53", "BRCA1", "EGFR"],\n' +
				'  target: "mmusculus"\n' +
				"});\n" +
				"return result;",
		},
		{
			method: "POST",
      queryParams: controls,
			path: "/snpense/snpense/",
			summary:
				"SNP mapping (g:SNPense). Map SNP rs-IDs to genes, chromosomal locations, and variant effects using Ensembl Variation data.",
			description:
				"JSON body fields:\n" +
				"- organism (string, required): Human organism hsapiens (g:SNPense is human-only)\n" +
				"- query (string[], required): SNP rsIDs, e.g. ['rs11540652', 'rs1800562', 'rs429358']\n" +
				"Returns: {result: [{rs_id, chromosome, start, end, strand, ensgs, gene_names, variants}], meta: {...}}",
			category: "variants",
			body: {
				contentType: "application/json",
				description:
					'{"organism": "hsapiens", "query": ["rs11540652", "rs1800562", "rs429358"]}',
			},
			example:
				'const result = await api.post("/snpense/snpense/", {\n' +
				'  organism: "hsapiens",\n' +
				'  query: ["rs11540652", "rs1800562", "rs429358"]\n' +
				"});\n" +
				"return result;",
		},
	],
};
