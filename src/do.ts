import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class GprofilerDataDO extends RestStagingDO {
	protected getSchemaHints(data: unknown): SchemaHints | undefined {
		if (!data || typeof data !== "object") return undefined;

		if (Array.isArray(data)) {
			const sample = data[0];
			if (sample && typeof sample === "object") {
				// Enrichment results from /gost/profile/
				if ("source" in sample && "native" in sample && "p_value" in sample) {
					return {
						tableName: "enriched_terms",
						indexes: ["source", "native", "name", "p_value"],
					};
				}
				// Conversion results from /convert/convert/
				if ("incoming" in sample && "converted" in sample && "name" in sample && !("ortholog_ensg" in sample)) {
					return {
						tableName: "converted_ids",
						indexes: ["incoming", "converted", "name"],
					};
				}
				// Ortholog results from /orth/orth/
				if ("incoming" in sample && "ortholog_ensg" in sample) {
					return {
						tableName: "orthologs",
						indexes: ["incoming", "name", "ortholog_ensg"],
					};
				}
				// SNPense results from /snpense/snpense/
				if ("rs_id" in sample && "chromosome" in sample) {
					return {
						tableName: "snp_mappings",
						indexes: ["rs_id", "chromosome", "gene_names"],
					};
				}
			}
		}

		return undefined;
	}
}
