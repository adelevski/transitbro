import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cta/rail/route";
import { GET as getBlueLine } from "@/app/api/cta/blue-line/route";
import { GET as getRedLine } from "@/app/api/cta/red-line/route";

const originalApiKey = process.env.CTA_API_KEY;
const originalPositionsUrl = process.env.CTA_TRAIN_POSITIONS_URL;
const originalFetch = globalThis.fetch;
let fetchCallCount = 0;

afterEach(() => {
  globalThis.fetch = originalFetch;
  fetchCallCount = 0;
  if (originalApiKey === undefined) {
    delete process.env.CTA_API_KEY;
  } else {
    process.env.CTA_API_KEY = originalApiKey;
  }
  if (originalPositionsUrl === undefined) {
    delete process.env.CTA_TRAIN_POSITIONS_URL;
  } else {
    process.env.CTA_TRAIN_POSITIONS_URL = originalPositionsUrl;
  }
});

describe("GET /api/cta/rail", () => {
  it("returns a no-store 503 response when server configuration is missing", async () => {
    delete process.env.CTA_API_KEY;

    const response = await GET(
      new NextRequest("https://transitbro.test/api/cta/rail?lines=blue")
    );

    assert.equal(response.status, 503);
    assert.equal(
      response.headers.get("cache-control"),
      "no-store, no-cache, must-revalidate"
    );
    assert.deepEqual(await response.json(), {
      error:
        "Live transit data is unavailable. Please try again later."
    });
  });

  it("normalizes requested lines and returns normalized upstream data", async () => {
    process.env.CTA_API_KEY = "test-key";
    process.env.CTA_TRAIN_POSITIONS_URL = "https://cta.test/positions";
    globalThis.fetch = (async (input) => {
      fetchCallCount += 1;
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

    const response = await GET(
      new NextRequest(
        "https://transitbro.test/api/cta/rail?lines=red,BLUE,invalid,red"
      )
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("cache-control"),
      "no-store, no-cache, must-revalidate"
    );
    assert.deepEqual(payload.routes, ["blue", "red"]);
    assert.deepEqual(
      payload.vehicles.map((vehicle: { id: string }) => vehicle.id),
      ["blue-100", "red-200"]
    );
    assert.equal(fetchCallCount, 2);
  });

  it("keeps the documented explicit-empty selection idle without an upstream call", async () => {
    process.env.CTA_API_KEY = "test-key";
    globalThis.fetch = (async () => {
      fetchCallCount += 1;
      throw new Error("Unexpected upstream request");
    }) as typeof fetch;

    const response = await GET(
      new NextRequest("https://transitbro.test/api/cta/rail?lines=")
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.routes, []);
    assert.deepEqual(payload.vehicles, []);
    assert.equal(fetchCallCount, 0);
  });
});


it("keeps credentials and raw upstream errors out of every API response", async () => {
  process.env.CTA_API_KEY = "synthetic-secret";
  globalThis.fetch = (async (_input, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    throw new Error("request failed: https://cta.test/?key=synthetic-secret");
  }) as typeof fetch;

  const responses = [
    await GET(new NextRequest("https://transitbro.test/api/cta/rail?lines=blue")),
    await getBlueLine(),
    await getRedLine()
  ];
  for (const response of responses) {
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
    const body = await response.text();
    assert.ok(!body.includes("synthetic-secret"));
    assert.ok(body.includes("could not be refreshed"));
  }
});
