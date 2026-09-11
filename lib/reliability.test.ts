import assert from "node:assert/strict";
import { test } from "node:test";
import { createFeedCache } from "./cache";
import { normalizeCtaTimestamp, normalizeLineFeed } from "./cta";
import { normalizeCtaArrivals } from "./ctaService";
import { CTA_RAIL_LINE_CONFIG } from "./ctaRailLines";
import { normalizeMbtaArrivals, normalizeMbtaVehicles } from "./mbta";
import {
  canInterpolate,
  formatCountdown,
  sampleAge,
  type RailVehicle,
} from "./transit";
import { startPolling } from "./poll";

const now = Date.parse("2026-09-12T04:59:00Z");
test("invalid calendar and DST-gap local dates are never reinterpreted by Date.parse", () => {
  for (const value of [
    "2026-02-30T12:00:00",
    "2026-03-08T02:30:00",
    "20260308 02:30:00",
  ])
    assert.equal(normalizeCtaTimestamp(value), null);
});
test("station board keeps the full date, schedule flag, uncertainty, and provider destination", () => {
  const board = normalizeCtaArrivals(
    {
      tmst: "20260911 23:59:00",
      eta: [
        {
          rn: "4",
          rt: "blue",
          destNm: "O'Hare",
          stpDe: "Northbound",
          prdt: "20260911 23:59:00",
          arrT: "20260912 00:01:00",
          isSch: "1",
          isFlt: "1",
        },
      ],
    },
    "40670",
    now,
  );
  assert.equal(board.arrivals[0].arrivalAt, "2026-09-12T05:01:00.000Z");
  assert.equal(board.arrivals[0].kind, "schedule");
  assert.equal(board.arrivals[0].uncertain, true);
  assert.equal(board.arrivals[0].destination, "O'Hare");
  assert.equal(formatCountdown(board.arrivals[0].arrivalAt, now), "2:00");
  assert.equal(
    formatCountdown(board.arrivals[0].arrivalAt, now + 1000),
    "1:59",
  );
  assert.deepEqual(normalizeCtaArrivals({}, "40670", now).arrivals, []);
});
test("missing provider dates remain unknown and unknown delay is never on-time", () => {
  const feed = normalizeLineFeed(
    { route: { train: { rn: "1", lat: 41, lon: -87 } } },
    CTA_RAIL_LINE_CONFIG.blue,
  );
  assert.equal(feed.updatedAt, "");
  assert.equal(feed.vehicles[0].updatedAt, "");
  assert.equal(feed.vehicles[0].isDelayed, null);
  assert.equal(sampleAge("", now), Infinity);
  assert.equal(sampleAge(new Date(now + 60_000).toISOString(), now), Infinity);
});
test("cache coalesces, serves stale only within budget, and cools failed fetches", async () => {
  let time = 0;
  let calls = 0;
  let resolve!: (value: number) => void;
  const cache = createFeedCache<number>(2, 20, 100, () => time);
  const one = cache("x", () => {
    calls++;
    return new Promise((r) => {
      resolve = r;
    });
  });
  const two = cache("x", async () => {
    calls++;
    return 9;
  });
  resolve(1);
  assert.deepEqual(await one, { value: 1, stale: false });
  assert.deepEqual(await two, { value: 1, stale: false });
  assert.equal(calls, 1);
  time = 21;
  assert.deepEqual(
    await cache("x", async () => {
      calls++;
      throw Error();
    }),
    { value: 1, stale: true },
  );
  assert.deepEqual(
    await cache("x", async () => {
      calls++;
      return 9;
    }),
    { value: 1, stale: true },
  );
  assert.equal(calls, 2);
  time = 101;
  await assert.rejects(cache("x", async () => 9));
});
test("motion only bridges current observed samples and never extrapolates old or identical reports", () => {
  const base: RailVehicle = {
    id: "one",
    line: "blue",
    runNumber: "1",
    lat: 41,
    lon: -87,
    heading: 0,
    isDelayed: null,
    destination: "Test",
    nextStop: "Test",
    nextStopArrivalAt: null,
    direction: null,
    updatedAt: new Date(now - 20_000).toISOString(),
  };
  assert.equal(canInterpolate(base, base, now), false);
  assert.equal(
    canInterpolate(
      base,
      { ...base, lat: 41.01, updatedAt: new Date(now).toISOString() },
      now,
    ),
    false,
  );
  assert.equal(
    canInterpolate(
      base,
      { ...base, lat: 41.001, updatedAt: new Date(now).toISOString() },
      now,
    ),
    true,
  );
  assert.equal(
    canInterpolate(
      base,
      { ...base, updatedAt: new Date(now - 40_000).toISOString() },
      now,
    ),
    false,
  );
});
test("disposed polling ignores delayed responses and aborts transport", async () => {
  let resolve!: (value: number) => void;
  let signal!: AbortSignal;
  let delivered = 0;
  const stop = startPolling({
    load: async (s) => {
      signal = s;
      return new Promise<number>((r) => (resolve = r));
    },
    receive: () => delivered++,
    fail: () => delivered++,
    interval: 1000,
  });
  stop();
  resolve(2);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(signal.aborted, true);
  assert.equal(delivered, 0);
});
test("MBTA drops cancelled/no-data predictions, preserves actual observation time", () => {
  const data = ["CANCELLED", "NO_DATA", null].map(
    (schedule_relationship, index) => ({
      id: String(index),
      type: "prediction",
      attributes: {
        schedule_relationship,
        arrival_time: "2026-09-12T01:01:00-04:00",
      },
      relationships: { route: { data: { id: "Red", type: "route" } } },
    }),
  );
  const board = normalizeMbtaArrivals({ data }, "park", now);
  assert.equal(board.arrivals.length, 1);
  assert.equal(board.updatedAt, null);
  assert.equal(board.arrivals[0].kind, "prediction");
  const feed = normalizeMbtaVehicles(
    {
      data: [
        {
          id: "one",
          type: "vehicle",
          attributes: {
            latitude: 42,
            longitude: -71,
            updated_at: "2026-09-11T23:00:00-04:00",
          },
          relationships: { route: { data: { id: "Red", type: "route" } } },
        },
      ],
    },
    ["Red"],
    now,
  );
  assert.equal(feed.vehicles[0].updatedAt, "2026-09-12T03:00:00.000Z");
  assert.notEqual(feed.updatedAt, feed.fetchedAt);
});
