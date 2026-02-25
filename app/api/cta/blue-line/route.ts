import { NextResponse } from "next/server";
import { fetchBlueLinePositions } from "@/lib/cta";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

export async function GET() {
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

  try {
    const feed = await fetchBlueLinePositions(apiKey);
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
