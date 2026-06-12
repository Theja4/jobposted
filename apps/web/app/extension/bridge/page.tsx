import type { Metadata } from "next";
import { ExtensionBridgeClient } from "./ExtensionBridgeClient";

export const metadata: Metadata = {
  title: "Connect JobPosted extension",
  robots: { index: false, follow: false },
};

export default async function ExtensionBridgePage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string; req?: string }>;
}) {
  const params = await searchParams;
  return <ExtensionBridgeClient requestId={params.requestId ?? params.req} />;
}
