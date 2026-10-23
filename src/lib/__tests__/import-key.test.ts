import { describe, expect, it } from "vitest";
import { computeImportKey } from "@/lib/connectors/import-key";
describe("import key", () => {
  it("is stable per user and evidence set, order independent", () => {
    expect(computeImportKey("u1", ["a", "b"])).toBe(computeImportKey("u1", ["b", "a", "a"]));
  });
  it("differs by user and by evidence", () => {
    expect(computeImportKey("u1", ["a"])).not.toBe(computeImportKey("u2", ["a"]));
    expect(computeImportKey("u1", ["a"])).not.toBe(computeImportKey("u1", ["a", "c"]));
  });
  it("is undefined without evidence and leaks no ids", () => {
    expect(computeImportKey("u1", [undefined])).toBeUndefined();
    expect(computeImportKey("u1", ["msg123"])).not.toContain("msg123");
  });
});
