// Deterministic gradient "artworks" for the Prism Studio demo. Renders are
// seeded from the prompt + style so the same input always produces the same
// image - across re-renders and across the display/download paths.

export type ArtStyle = {
  id: string;
  name: string;
  /** Requires the Prism Pro subscription (feature slug `pro`). */
  pro: boolean;
  /** Canvas base color. */
  base: string;
  /** Color pool the generator draws blobs from. First two double as the chip swatch. */
  colors: string[];
};

export const ART_STYLES: ArtStyle[] = [
  {
    id: "aurora",
    name: "Aurora",
    pro: false,
    base: "#0f172a",
    colors: ["#22d3ee", "#818cf8", "#34d399", "#c084fc"],
  },
  {
    id: "dune",
    name: "Dune",
    pro: false,
    base: "#fff7ed",
    colors: ["#fb923c", "#f59e0b", "#fda4af", "#fcd34d"],
  },
  {
    id: "mist",
    name: "Mist",
    pro: false,
    base: "#f8fafc",
    colors: ["#94a3b8", "#a5b4fc", "#bae6fd", "#e2e8f0"],
  },
  {
    id: "neon",
    name: "Neon",
    pro: true,
    base: "#09090b",
    colors: ["#f0abfc", "#22d3ee", "#facc15", "#fb7185"],
  },
  {
    id: "nightbloom",
    name: "Nightbloom",
    pro: true,
    base: "#1e1b4b",
    colors: ["#f472b6", "#a78bfa", "#38bdf8", "#4ade80"],
  },
  {
    id: "solar",
    name: "Solar flare",
    pro: true,
    base: "#450a0a",
    colors: ["#f97316", "#fde047", "#fb7185", "#fca5a5"],
  },
];

/** FNV-1a - small, stable string hash. */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 - tiny seeded PRNG, plenty for decorative output. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ArtworkOptions = {
  size?: number;
  /** Renders a small PRISM badge - removed for Pro wallets. */
  watermark?: boolean;
};

export function artworkSvg(
  prompt: string,
  style: ArtStyle,
  { size = 512, watermark = false }: ArtworkOptions = {},
): string {
  const rand = mulberry32(
    hashSeed(`${style.id}:${prompt.trim().toLowerCase()}`),
  );
  const pick = <T>(arr: readonly T[]): T =>
    arr[Math.floor(rand() * arr.length)]!;

  const blobs: string[] = [];
  const count = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const cx = (rand() * size).toFixed(1);
    const cy = (rand() * size).toFixed(1);
    const rx = (size * (0.18 + rand() * 0.3)).toFixed(1);
    const ry = (size * (0.14 + rand() * 0.3)).toFixed(1);
    const rot = Math.floor(rand() * 180);
    const opacity = (0.45 + rand() * 0.4).toFixed(2);
    blobs.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${pick(style.colors)}" opacity="${opacity}" transform="rotate(${rot} ${cx} ${cy})"/>`,
    );
  }

  // Scale factor so the watermark stays proportional in HD downloads.
  const u = size / 512;
  const badge = watermark
    ? `<g><rect x="${size - 88 * u}" y="${size - 34 * u}" width="${76 * u}" height="${22 * u}" rx="${6 * u}" fill="#09090b" opacity="0.4"/><text x="${size - 50 * u}" y="${size - 19 * u}" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,monospace" font-size="${11 * u}" letter-spacing="${2 * u}" fill="#ffffff" opacity="0.9">PRISM</text></g>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<defs><filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${Math.round(size / 9)}"/></filter></defs>` +
    `<rect width="${size}" height="${size}" fill="${style.base}"/>` +
    `<g filter="url(#blur)">${blobs.join("")}</g>` +
    badge +
    `</svg>`
  );
}

export function artworkDataUrl(
  prompt: string,
  style: ArtStyle,
  opts?: ArtworkOptions,
): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(artworkSvg(prompt, style, opts))}`;
}
