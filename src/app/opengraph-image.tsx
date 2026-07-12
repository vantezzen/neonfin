import { ImageResponse } from "next/og";

export const alt =
  "vantezzen/pay - charge for your side project without building billing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 82px",
        background: "#09090b",
        color: "#fafafa",
        fontFamily: "monospace",
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 700 }}>vantezzen/pay</div>
      <div
        style={{
          maxWidth: 980,
          fontSize: 68,
          lineHeight: 1.08,
          fontWeight: 700,
        }}
      >
        Charge for your side project - without building billing
      </div>
      <div style={{ fontSize: 24, color: "#a1a1aa" }}>
        Stripe &amp; Polar · shadcn registry · self-hostable
      </div>
    </div>,
    size,
  );
}
