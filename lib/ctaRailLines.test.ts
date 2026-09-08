import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CTA_RAIL_LINE_CONFIG,
  normalizeCtaRailLineSelection
} from "@/lib/ctaRailLines";

describe("normalizeCtaRailLineSelection", () => {
  it("deduplicates valid lines in canonical display order", () => {
    assert.deepEqual(
      normalizeCtaRailLineSelection(["red", "invalid", "blue", "red"]),
      ["blue", "red"]
    );
  });

  it("supports explicit empty selections and opt-in Blue fallback", () => {
    assert.deepEqual(normalizeCtaRailLineSelection([]), []);
    assert.deepEqual(
      normalizeCtaRailLineSelection([], { fallbackToDefaultLine: true }),
      ["blue"]
    );
  });

  it("keeps route-specific operational direction labels", () => {
    assert.equal(CTA_RAIL_LINE_CONFIG.blue.directionLabels["1"], "O'Hare-bound");
    assert.equal(CTA_RAIL_LINE_CONFIG.org.directionLabels["1"], "Loop-bound");
    assert.equal(CTA_RAIL_LINE_CONFIG.y.directionLabels["5"], "Howard-bound");
  });
});
