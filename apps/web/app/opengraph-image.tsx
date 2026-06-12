import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const runtime = "edge";
export const alt = `${SITE_NAME}, queue tailored applications you approve`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 62%, #dbeafe 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#1f64e0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            ✓
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#0c1410" }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: "#0c1410",
              lineHeight: 1.05,
              maxWidth: 980,
            }}
          >
            Apply to roles worth your time. <span style={{ color: "#1f64e0" }}>You confirm.</span>
          </div>
          <div style={{ fontSize: 30, color: "#526173", maxWidth: 900 }}>
            Tailored to every role, you confirm every submission, never sprayed.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
