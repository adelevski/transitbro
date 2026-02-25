import { NextRequest, NextResponse } from "next/server";
import { fetchCtaRailPositions } from "@/lib/cta";
import { normalizeCtaRailLineSelection } from "@/lib/ctaRailLines";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

export async function GET(request: NextRequest) {
  const apiKey = process.env.CTA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing CTA_API_KEY. Add it to .env.local using your CTA Train Tracker key."
      },
      {
        status: 503,
        headers: NO_STORE_HEADERS
      }
    );
  }

  const hasLinesParam = request.nextUrl.searchParams.has("lines");
  const lineParam = request.nextUrl.searchParams.get("lines") ?? "";
  const requestedLines = lineParam
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const lines = normalizeCtaRailLineSelection(requestedLines, {
    fallbackToDefaultLine: !hasLinesParam
  });

  try {
    const feed = await fetchCtaRailPositions(apiKey, lines);
    return NextResponse.json(feed, {
      headers: NO_STORE_HEADERS
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown CTA upstream error.";

    return NextResponse.json(
      {
        error: message
      },
      {
        status: 502,
        headers: NO_STORE_HEADERS
      }
    );
  }
}
