import { NextRequest, NextResponse } from "next/server";
import { getCtaPositions } from "@/lib/ctaService";
import { normalizeCtaRailLineSelection } from "@/lib/ctaRailLines";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET(request: NextRequest) {
  const apiKey = process.env.CTA_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Live transit data is unavailable. Please try again later.",
      },
      {
        status: 503,
        headers: NO_STORE_HEADERS,
      },
    );
  }

  const hasLinesParam = request.nextUrl.searchParams.has("lines");
  const lineParam = request.nextUrl.searchParams.get("lines") ?? "";
  const requestedLines = lineParam
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const lines = normalizeCtaRailLineSelection(requestedLines, {
    fallbackToDefaultLine: !hasLinesParam,
  });

  try {
    const feed = await getCtaPositions(apiKey, lines);
    return NextResponse.json(feed, {
      headers: NO_STORE_HEADERS,
    });
  } catch {
    // Upstream errors can echo request URLs containing the server credential.
    return NextResponse.json(
      {
        error: "Live transit data could not be refreshed. Please try again.",
      },
      {
        status: 502,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
