import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import { flattenObject, type SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

type Row = Record<string, unknown>;
const record = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
const row = (value: unknown, index: number): Row => ({
  ...(record(value) ? { ...flattenObject(value, 2), ...Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, item !== null && typeof item === "object" ? JSON.stringify(item) : item])) } : { value }),
  native_json: JSON.stringify(value), result_index: index,
});
function resultTable(values: unknown[], context: Row): string {
  const sample = values.find(record);
  const provenance = record(context._gprofiler) ? context._gprofiler : {};
  const path = String(provenance.source_url ?? "");
  if (path.includes("/gost/") || sample && "native" in sample && "source" in sample) return "enriched_terms";
  if (path.includes("/orth/") || sample && "ortholog_ensg" in sample) return "orthologs";
  if (path.includes("/convert/") || sample && "incoming" in sample && "converted" in sample) return "converted_ids";
  if (path.includes("/snpense/") || sample && "rs_id" in sample) return "snp_mappings";
  if (path.includes("/organisms_list/") || sample && "nonnumeric_namespaces" in sample) return "organisms";
  return "result_records";
}

/** Keep native vectors and metadata together; never expand combined scores into a cross-product. */
export class GprofilerDataDO extends RestStagingDO {
  protected getTabularData(value: unknown): unknown {
    const data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
      ? value.structuredContent.data : value;
    if (Array.isArray(data)) return { native_records: data.map(row) };
    if (!record(data)) return data;
    if (typeof data.sql === "string" && Array.isArray(data.rows)) return { query_rows: data.rows.map(row) };
    const { result, ...context } = data;
    const tables: Record<string, Row[]> = { response_context: [{ native_json: JSON.stringify(context) }] };
    if (Array.isArray(result)) tables[resultTable(result, context)] = result.map(row);
    else tables.native_objects = [row(data, 0)];
    const meta = record(data.meta) ? data.meta : {};
    if (record(meta.query_metadata)) tables.query_metadata = [row(meta.query_metadata, 0)];
    const genes = record(meta.genes_metadata) ? meta.genes_metadata : {};
    if (record(genes.query)) tables.gene_queries = Object.entries(genes.query).map(([name, value], index) => ({ ...row(value, index), query_name: name }));
    if (record(meta.result_metadata)) tables.source_statistics = Object.entries(meta.result_metadata).map(([source, value], index) => ({ ...row(value, index), source }));
    if (record(data.sources)) tables.source_versions = Object.entries(data.sources).map(([source, value], index) => ({ ...row(value, index), source }));
    return tables;
  }

  protected getSchemaHints(value: unknown): SchemaHints {
    const tables = this.getTabularData(value);
    const columnTypes: Record<string, string> = { native_json: "TEXT", query_name: "TEXT", source: "TEXT" };
    if (record(tables)) for (const values of Object.values(tables)) {
      if (!Array.isArray(values)) continue;
      for (const item of values) if (record(item)) for (const [key, value] of Object.entries(item)) {
        if (typeof value === "string") columnTypes[key] = "TEXT";
      }
    }
    return { columnTypes };
  }
}
