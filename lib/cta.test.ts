import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  fetchCtaRailLinePositions,
  fetchCtaRailPositions,
  normalizeCtaTimestamp
} from "@/lib/cta";

const originalPollInterval = process.env.CTA_POLL_INTERVAL_MS;
const originalPositionsUrl = process.env.CTA_TRAIN_POSITIONS_URL;
const originalFetch = globalThis.fetch;
let fetchCalls: Array<[string | URL | Request, RequestInit | undefined]> = [];

function mockCtaResponse(ctatt: Record<string, unknown>) {
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push([input, init]);
    return new Response(JSON.stringify({ ctatt }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;
}

describe("CTA timestamp normalization", () => {
  it("converts CTA local timestamps to unambiguous ISO timestamps", () => {
    assert.equal(
      normalizeCtaTimestamp("20260827 13:45:00"),
      "2026-08-27T18:45:00.000Z"
    );
    assert.equal(
      normalizeCtaTimestamp("20260115 13:45:00"),
      "2026-01-15T19:45:00.000Z"
    );
    assert.equal(
      normalizeCtaTimestamp("2026-08-27T13:45:00"),
      "2026-08-27T18:45:00.000Z"
    );
  });

  it("preserves valid instants and rejects malformed timestamps", () => {
    assert.equal(
      normalizeCtaTimestamp("2026-08-27T18:45:00Z"),
      "2026-08-27T18:45:00.000Z"
    );
    assert.equal(normalizeCtaTimestamp("not-a-timestamp"), null);
    assert.equal(normalizeCtaTimestamp("20261345 25:61:00"), null);
  });
});

describe("CTA feed normalization", () => {
  beforeEach(() => {
    fetchCalls = [];
    process.env.CTA_POLL_INTERVAL_MS = "2500";
    process.env.CTA_TRAIN_POSITIONS_URL = "https://cta.test/positions";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalPollInterval === undefined) {
      delete process.env.CTA_POLL_INTERVAL_MS;
    } else {
      process.env.CTA_POLL_INTERVAL_MS = originalPollInterval;
    }
    if (originalPositionsUrl === undefined) {
      delete process.env.CTA_TRAIN_POSITIONS_URL;
    } else {
      process.env.CTA_TRAIN_POSITIONS_URL = originalPositionsUrl;
    }
  });

  it("normalizes singleton CTA records and clamps the polling interval", async () => {
    mockCtaResponse({
      tmst: "20260827 13:45:00",
      errCd: "0",
      route: {
        train: {
          rn: "123",
          lat: "41.881",
          lon: "-87.629",
          heading: "270",
          isDly: "1",
          destNm: "Forest Park",
          nextStaNm: "Clark/Lake",
          arrT: "20260827 13:47:00",
          prdt: "20260827 13:44:30",
          trDr: "5"
        }
      }
    });

    const feed = await fetchCtaRailLinePositions("test-key", "blue");

    assert.equal(feed.route, "blue");
    assert.deepEqual(feed.routes, ["blue"]);
    assert.equal(feed.updatedAt, "2026-08-27T18:44:30.000Z");
    assert.equal(feed.pollIntervalMs, 5000);
    assert.deepEqual(feed.vehicles, [
      {
        id: "blue-123",
        line: "blue",
        runNumber: "123",
        lat: 41.881,
        lon: -87.629,
        heading: 270,
        isDelayed: true,
        destination: "Forest Park",
        nextStop: "Clark/Lake",
        nextStopArrivalAt: "2026-08-27T18:47:00.000Z",
        direction: "Forest Park-bound",
        updatedAt: "2026-08-27T18:44:30.000Z"
      }
    ]);

    const requestedUrl = new URL(fetchCalls[0]?.[0].toString() ?? "");
    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      "https://cta.test/positions"
    );
    assert.equal(requestedUrl.searchParams.get("key"), "test-key");
    assert.equal(requestedUrl.searchParams.get("rt"), "blue");
    assert.equal(requestedUrl.searchParams.get("outputType"), "JSON");
  });

  it("drops records with missing, blank, or impossible coordinates", async () => {
    mockCtaResponse({
      tmst: "20260827 13:45:00",
      errCd: "0",
      route: {
        train: [
          { rn: "missing", lat: null, lon: "-87.629" },
          { rn: "blank", lat: "", lon: "-87.629" },
          { rn: "range", lat: "141.881", lon: "-87.629" },
          { rn: "valid", lat: "41.881", lon: "-87.629" }
        ]
      }
    });

    const feed = await fetchCtaRailLinePositions("test-key", "red");

    assert.equal(feed.vehicles.length, 1);
    assert.equal(feed.vehicles[0]?.id, "red-valid");
  });

  it("aggregates line feeds into a stable route and vehicle order", async () => {
    globalThis.fetch = (async (input) => {
      const route = new URL(input.toString()).searchParams.get("rt");
      return new Response(
        JSON.stringify({
          ctatt: {
            tmst: "20260827 13:45:00",
            errCd: "0",
            route: {
              train: {
                rn: route === "red" ? "200" : "100",
                lat: "41.881",
                lon: "-87.629"
              }
            }
          }
        })
      );
    }) as typeof fetch;

    const feed = await fetchCtaRailPositions("test-key", ["red", "blue"]);

    assert.deepEqual(feed.routes, ["red", "blue"]);
    assert.deepEqual(feed.vehicles.map((vehicle) => vehicle.id), [
      "blue-100",
      "red-200"
    ]);
  });

  it("rejects CTA-declared and HTTP failures", async () => {
    mockCtaResponse({ errCd: "100", errNm: "Invalid route" });
    await assert.rejects(
      fetchCtaRailLinePositions("test-key", "blue"),
      /CTA error 100: Invalid route/
    );

    globalThis.fetch = (async () =>
      new Response(null, { status: 503 })) as typeof fetch;
    await assert.rejects(
      fetchCtaRailLinePositions("test-key", "blue"),
      /CTA request failed with status 503/
    );
  });
});
