type QueryError = { message: string };
type PageResult<T> = { data: T[] | null; error: QueryError | null; count?: number | null };
type CollectionResult<T> = { data: T[] | null; error: QueryError | null };

// The caller must order by a unique key and request an exact count.
// Advancing by the returned size also supports server caps below PAGE_SIZE.
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<CollectionResult<T>> {
  const rows: T[] = [];
  const pageSize = 500;
  try {
    for (;;) {
      const result = await fetchPage(rows.length, rows.length + pageSize - 1);
      if (result.error) return { data: null, error: result.error };
      const page = result.data ?? [];
      rows.push(...page);
      if (result.count != null && rows.length >= result.count) {
        return { data: rows, error: null };
      }
      if (page.length === 0) {
        if (result.count != null && rows.length < result.count) {
          return { data: null, error: { message: "La consulta devolvio datos incompletos. Intenta nuevamente." } };
        }
        return { data: rows, error: null };
      }
    }
  } catch (cause) {
    return { data: null, error: { message: cause instanceof Error ? cause.message : "No se pudo completar la consulta." } };
  }
}

// Keep IN filters small enough for the request URL as the catalog grows.
export async function fetchAllByIds<T>(
  ids: number[],
  fetchPage: (batch: number[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<CollectionResult<T>> {
  const uniqueIds = [...new Set(ids)];
  const rows: T[] = [];
  for (let start = 0; start < uniqueIds.length; start += 200) {
    const batch = uniqueIds.slice(start, start + 200);
    const result = await fetchAllPages((from, to) => fetchPage(batch, from, to));
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
  }
  return { data: rows, error: null };
}
