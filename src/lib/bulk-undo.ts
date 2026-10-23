export interface BulkRecord<C> {
  /** Subscription ids created, same order as candidates. */
  ids: string[];
  candidates: C[];
}

/**
 * Splits a bulk add into what was undone and what is left, pairing each id with the
 * candidate it came from by position. Candidates are restored only for deleted rows.
 */
export function planBulkUndo<C>(
  record: BulkRecord<C>,
  failedIds: ReadonlySet<string>
): { restored: C[]; remaining: BulkRecord<C> | null; undoneCount: number } {
  const restored: C[] = [];
  const remaining: BulkRecord<C> = { ids: [], candidates: [] };
  record.ids.forEach((id, i) => {
    if (failedIds.has(id)) {
      remaining.ids.push(id);
      remaining.candidates.push(record.candidates[i]);
    } else {
      restored.push(record.candidates[i]);
    }
  });
  return {
    restored,
    remaining: remaining.ids.length ? remaining : null,
    undoneCount: restored.length,
  };
}
