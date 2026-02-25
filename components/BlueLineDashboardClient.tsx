"use client";

import dynamic from "next/dynamic";

const BlueLineDashboard = dynamic(
  () => import("@/components/BlueLineDashboard"),
  {
    ssr: false,
    loading: () => (
      <main className="loading-shell">
        <p>Loading transitbro...</p>
      </main>
    )
  }
);

export default function BlueLineDashboardClient() {
  return <BlueLineDashboard />;
}
