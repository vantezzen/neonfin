import "server-only";
import { createQr } from "@/lib/pay/qr";

export function createQrSvg(value: string): string | null {
  const qr = createQr(value);
  if (!qr) return null;

  const margin = 4;
  const moduleSize = 6;
  const size = (qr.size + margin * 2) * moduleSize;
  const rects: string[] = [];

  qr.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (!dark) return;
      rects.push(
        `<rect x="${(x + margin) * moduleSize}" ` +
          `y="${(y + margin) * moduleSize}" ` +
          `width="${moduleSize}" height="${moduleSize}"/>`,
      );
    });
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" ` +
    `height="${size}" viewBox="0 0 ${size} ${size}" role="img" ` +
    `aria-label="Wallet recovery QR">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    `<g fill="#111827">${rects.join("")}</g></svg>`
  );
}
