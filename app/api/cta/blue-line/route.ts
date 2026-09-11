import { NextResponse } from "next/server";
import { getCtaPositions } from "@/lib/ctaService";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function GET() {
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

  try {
    const feed = {
      ...(await getCtaPositions(apiKey, ["blue"])),
      route: "blue",
    };
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
