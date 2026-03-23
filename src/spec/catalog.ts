import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const gprofilerCatalog: ApiCatalog = {
	name: "g:Profiler",
	baseUrl: "https://biit.cs.ut.ee/gprofiler/api",
	version: "r2024_01",
	auth: "none",
	endpointCount: 4,
	notes:
		"- All endpoints use POST with JSON body — use api.post(path, body)\n" +
		"- Default organism: 'hsapiens'. Supports 700+ species (e.g. 'mmusculus', 'rnorvegicus', 'dmelanogaster', 'scerevisiae')\n" +
		"- Gene queries accept mixed ID types: Ensembl (ENSG...), gene symbols (TP53), UniProt, RefSeq, etc.\n" +
		"- Enrichment sources: GO:BP, GO:MF, GO:CC, KEGG, REAC (Reactome), WP (WikiPathways), TF (TRANSFAC), MIRNA (miRTarBase), HPA (Human Protein Atlas), CORUM (protein complexes), HP (Human Phenotype Ontology)\n" +
		"- Results can be large: a 10-gene query may return 700+ enriched terms — staging will activate automatically\n" +
		"- No authentication required, no documented rate limits\n" +
		"- Free academic service from University of Tartu",
	endpoints: [
		{
			method: "POST",
			path: "/gost/profile/",
			summary:
				"Gene set enrichment analysis (g:GOSt). Submit a list of genes and get enriched biological terms from GO, KEGG, Reactome, WikiPathways, TRANSFAC, miRTarBase, HPA, CORUM, and HP ontologies.",
			description:
				"JSON body fields:\n" +
				"- organism (string, required): Organism ID, e.g. 'hsapiens', 'mmusculus'. Default: 'hsapiens'\n" +
				"- query (string[], required): Gene list — symbols, Ensembl IDs, UniProt, or mixed\n" +
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
				"return result.data;",
		},
		{
			method: "POST",
			path: "/convert/convert/",
			summary:
				"Gene ID conversion (g:Convert). Convert gene identifiers between namespaces — Ensembl, UniProt, NCBI Entrez, RefSeq, HGNC, etc.",
			description:
				"JSON body fields:\n" +
				"- organism (string, required): Organism ID, e.g. 'hsapiens'\n" +
				"- query (string[], required): IDs to convert\n" +
				"- target (string, optional): Target namespace — ENSG, ENSP, ENST, UNIPROT, ENTREZGENE, HGNC, REFSEQ, WIKIGENE. Default: ENSG\n" +
				"- numeric_namespace (string, optional): Namespace hint for bare numeric IDs (e.g. 'ENTREZGENE')\n" +
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
				"return result.data;",
		},
		{
			method: "POST",
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
				"return result.data;",
		},
		{
			method: "POST",
			path: "/snpense/snpense/",
			summary:
				"SNP mapping (g:SNPense). Map SNP rs-IDs to genes, chromosomal locations, and variant effects using Ensembl Variation data.",
			description:
				"JSON body fields:\n" +
				"- organism (string, required): Organism ID, e.g. 'hsapiens'\n" +
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
				"return result.data;",
		},
	],
};
