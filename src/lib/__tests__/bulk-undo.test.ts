import { describe, expect, it } from "vitest";
import { planBulkUndo } from "../bulk-undo";

const rec = { ids: ["s1", "s2", "s3"], candidates: ["A", "B", "C"] };

describe("planBulkUndo", () => {
  it("restores every candidate when all deletes succeed", () => {
    const r = planBulkUndo(rec, new Set());
    expect(r.restored).toEqual(["A", "B", "C"]);
    expect(r.remaining).toBeNull();
  });
  it("keeps only failed rows and restores the matching candidates, even mid-list", () => {
    const r = planBulkUndo(rec, new Set(["s2"]));
    expect(r.restored).toEqual(["A", "C"]);
    expect(r.remaining).toEqual({ ids: ["s2"], candidates: ["B"] });
    expect(r.undoneCount).toBe(2);
  });
  it("restores nothing when every delete fails", () => {
    const r = planBulkUndo(rec, new Set(["s1", "s2", "s3"]));
    expect(r.restored).toEqual([]);
    expect(r.remaining).toEqual(rec);
  });
  it("a retry after partial failure only touches the remaining rows", () => {
    const first = planBulkUndo(rec, new Set(["s2"]));
    const second = planBulkUndo(first.remaining!, new Set());
    expect(second.restored).toEqual(["B"]);
    expect(second.remaining).toBeNull();
  });
});
