import { NextRequest, NextResponse } from "next/server";
import { getCtaArrivals } from "@/lib/ctaService";
import { CTA_STATIONS } from "@/lib/ctaStations";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const station = request.nextUrl.searchParams.get("station") ?? "";
  if (!CTA_STATIONS.some((item) => item.id === station))
    return NextResponse.json(
      { error: "Choose a supported CTA station." },
      { status: 400, headers },
    );
  const key = process.env.CTA_API_KEY?.trim();
  if (!key)
    return NextResponse.json(
      {
        error:
          "CTA arrivals are unavailable. Server configuration is required.",
      },
      { status: 503, headers },
    );
  try {
    return NextResponse.json(await getCtaArrivals(key, station), { headers });
  } catch {
    return NextResponse.json(
      { error: "CTA arrivals could not be refreshed. Please try again later." },
      { status: 502, headers },
    );
  }
}
