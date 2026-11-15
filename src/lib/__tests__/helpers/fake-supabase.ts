export function fakeSupabase(initial: Record<string, unknown> | null) {
  let row: Record<string, unknown> | null = initial ? { ...initial } : null;
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      upsert: async (v: Record<string, unknown>) => { row = { ...(row ?? {}), ...v }; return { error: null }; },
      update: (v: Record<string, unknown>) => ({ eq: async () => { if (row) row = { ...row, ...v }; return { error: null }; } }),
      delete: () => ({ eq: async () => { row = null; return { error: null }; } }),
    }),
  };
  return { client: client as never, get row() { return row; } };
}

