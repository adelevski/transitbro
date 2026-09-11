import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "./route";
const originalKey = process.env.CTA_API_KEY;
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.CTA_API_KEY;
  else process.env.CTA_API_KEY = originalKey;
});
const request = (station: string) =>
  new NextRequest(
    `https://transitbro.test/api/cta/arrivals?station=${station}`,
  );
test("station IDs are allowlisted before fetching", async () => {
  globalThis.fetch = (async () => {
    throw new Error("Must not fetch");
  }) as typeof fetch;
  assert.equal((await GET(request("not-a-station"))).status, 400);
});
test("missing server credential is unavailable, never a simulated board", async () => {
  delete process.env.CTA_API_KEY;
  const response = await GET(request("40670"));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('arrivals":['));
});
test("station arrivals use a private key and preserve schedule semantics", async () => {
  process.env.CTA_API_KEY = "fixture-arrivals";
  globalThis.fetch = (async (input, init) => {
    const url = new URL(input.toString());
    assert.equal(url.searchParams.get("mapid"), "40670");
    assert.equal(url.searchParams.get("key"), "fixture-arrivals");
    assert.ok(init?.signal);
    return Response.json({
      ctatt: {
        errCd: "0",
        tmst: "20260911 13:00:00",
        eta: {
          rn: "1",
          rt: "blue",
          arrT: "20260911 13:02:00",
          destNm: "O'Hare",
          isSch: "1",
        },
      },
    });
  }) as typeof fetch;
  const response = await GET(request("40670"));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(body).arrivals[0].kind, "schedule");
  assert.ok(!body.includes("fixture-arrivals"));
});
test("upstream failures cannot echo secrets or request URLs", async () => {
  process.env.CTA_API_KEY = "fixture-failure";
  globalThis.fetch = (async () => {
    throw new Error("https://provider.test/?key=fixture-failure");
  }) as typeof fetch;
  const response = await GET(request("40670"));
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.ok(!text.includes("fixture-failure"));
  assert.ok(!text.includes("provider.test"));
});
