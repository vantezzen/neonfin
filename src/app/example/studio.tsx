"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  Code2,
  Download,
  Image as ImageIcon,
  Loader2,
  Lock,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PayError } from "@/lib/pay";
import { CreditGate } from "@/components/pay/credit-gate";
import { FeatureGate } from "@/components/pay/feature-gate";
import {
  useCheckoutPaid,
  useCredits,
  useFeature,
  useSubscription,
} from "@/components/pay/provider";
import {
  PurchaseButton,
  PurchaseDialog,
  recommendMiddleOption,
} from "@/components/pay/purchase-dialog";
import { RemainingCredits } from "@/components/pay/remaining-credits";
import { WalletButton } from "@/components/pay/wallet-button";
import {
  ART_STYLES,
  artworkDataUrl,
  artworkSvg,
  type ArtStyle,
} from "./artwork";

/** Feature slugs the demo catalog must define — see SETUP.md. */
const PRO_FEATURE = "pro";
const LICENSE_FEATURE = "commercial-license";

const SAMPLE_PROMPTS = [
  "Glass mountains at dawn",
  "Deep sea signals",
  "Neon rain over the city",
];

type Artwork = {
  id: string;
  prompt: string;
  styleId: string;
  ready: boolean;
};

/* ------------------------------------------------------------------ */
/* "Reveal the components" mode: dashed outlines + labels on every    */
/* pay-powered element, so visitors see exactly where the SDK lives.  */
/* ------------------------------------------------------------------ */

const SeamsContext = React.createContext(false);

function Seam({
  label,
  className,
  labelClassName,
  children,
}: {
  label: string;
  className?: string;
  /**
   * Overrides the label's position. Defaults to centered just below the
   * element; pass a stagger (e.g. `top-full mt-6`) so adjacent seams in a row
   * don't stack their labels on the same line and hide each other.
   */
  labelClassName?: string;
  children: React.ReactNode;
}) {
  const on = React.useContext(SeamsContext);
  return (
    <div className={cn("relative", className)}>
      {children}
      {on ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 z-10 rounded-lg border-2 border-dashed border-primary/70"
          />
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-1/2 z-20 max-w-48 -translate-x-1/2 truncate rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] leading-none whitespace-nowrap text-primary-foreground shadow-sm",
              labelClassName ?? "top-full mt-1",
            )}
          >
            {label}
          </span>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PrismStudio() {
  const credits = useCredits();
  const pro = useFeature(PRO_FEATURE);
  const { subscription } = useSubscription();

  const [seams, setSeams] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [styleId, setStyleId] = useState(ART_STYLES[0]!.id);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [rendering, setRendering] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [paidFlash, setPaidFlash] = useState(false);
  const promptId = React.useId();

  const style = ART_STYLES.find((s) => s.id === styleId) ?? ART_STYLES[0]!;

  // Celebrate completed checkouts (popup close or redirect resume). The dialog
  // picks its own "Popular" pack via `recommendMiddleOption` — no fetching here.
  const flashTimer = useRef<number | undefined>(undefined);
  useCheckoutPaid(() => {
    setPaidFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setPaidFlash(false), 5000);
  });
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  async function generate() {
    const trimmed = prompt.trim();
    if (!trimmed || rendering) return;
    setNote(null);
    setRendering(true);
    try {
      await credits.deduct(1, {
        idempotencyKey: crypto.randomUUID(),
        meta: { demo: "prism", prompt: trimmed, style: style.id },
      });
    } catch (err) {
      setRendering(false);
      setNote(
        err instanceof PayError && err.isInsufficientCredits
          ? "You're out of images — grab a pack to keep creating."
          : "Couldn't start the render. Please try again.",
      );
      return;
    }
    const id = crypto.randomUUID();
    setArtworks((all) => [
      { id, prompt: trimmed, styleId: style.id, ready: false },
      ...all,
    ]);
    window.setTimeout(() => {
      setArtworks((all) =>
        all.map((a) => (a.id === id ? { ...a, ready: true } : a)),
      );
      setRendering(false);
    }, 1100);
  }

  return (
    <SeamsContext.Provider value={seams}>
      <div className="flex flex-col">
        {/* Demo frame banner — full-width strip above the app */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-6">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Prism Studio is a fictional app
            </span>{" "}
            showing vantezzen/pay end to end. Checkout runs in Stripe test mode
            — pay with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              4242 4242 4242 4242
            </code>
            , any future expiry, any CVC.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSeams((v) => !v)}
            aria-pressed={seams}
          >
            <Code2 className="size-4" />
            {seams ? "Hide the components" : "Reveal the components"}
          </Button>
        </div>

        {paidFlash ? (
          <p
            role="status"
            className="flex items-center gap-2 border-b bg-emerald-50/60 px-4 py-2.5 text-sm sm:px-6 dark:bg-emerald-950/30 motion-safe:animate-in motion-safe:fade-in"
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-emerald-500"
            />
            Payment confirmed — your wallet is topped up and everything below
            updated automatically.
          </p>
        ) : null}

        {/* The app shell — spans the full page width */}
        <div className="bg-background">
          <header
            className={cn(
              "flex flex-wrap items-center justify-end gap-2 border-b px-4 py-3 sm:px-6",
              // Reveal mode adds a band below the controls so the staggered
              // component labels have room and don't overlap the app body.
              seams && "pb-16",
            )}
          >
            <Seam label="<RemainingCredits />" labelClassName="top-full mt-1">
              <span className="flex items-center gap-0.5 rounded-full border bg-muted/30 py-0.5 pr-0.5 pl-3 text-sm font-medium">
                <RemainingCredits />
                <PurchaseButton
                  variant="ghost"
                  className="size-6 rounded-full p-0"
                  filters={{ grantsCredits: true }}
                  recommendedPriceId={recommendMiddleOption}
                  title="Get more images"
                  aria-label="Buy more images"
                >
                  <Plus className="size-3.5" />
                </PurchaseButton>
              </span>
            </Seam>

            <Seam
              label='filters={{ features: ["pro"] }}'
              labelClassName="top-full mt-6"
            >
              {pro.enabled ? (
                <PurchaseButton
                  variant="outline"
                  size="sm"
                  filters={{ features: [PRO_FEATURE] }}
                  title="Your Prism Pro plan"
                  description="Change or cancel any time — billing is handled by the provider portal."
                >
                  <Check className="size-4 text-emerald-600" />
                  {subscription?.label ?? "Pro"}
                </PurchaseButton>
              ) : (
                <PurchaseButton
                  variant="outline"
                  size="sm"
                  filters={{ features: [PRO_FEATURE] }}
                  title="Upgrade to Prism Pro"
                  description="Premium styles and watermark-free renders — cancel anytime."
                >
                  Upgrade
                </PurchaseButton>
              )}
            </Seam>

            <Seam label="<WalletButton />" labelClassName="top-full mt-11">
              <WalletButton
                variant="ghost"
                size="icon"
                aria-label="Your wallet"
              />
            </Seam>
          </header>

          <div className="grid lg:min-h-[70vh] lg:grid-cols-[360px_1fr]">
            {/* Create panel */}
            <aside className="flex flex-col gap-5 border-b p-4 sm:p-6 lg:border-r lg:border-b-0">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={promptId}>Describe your scene</Label>
                <Input
                  id={promptId}
                  value={prompt}
                  onChange={(e) => setPrompt(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void generate();
                  }}
                  placeholder="A quiet morning over glass mountains"
                  autoComplete="off"
                />
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {SAMPLE_PROMPTS.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setPrompt(sample)}
                      className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>

              <Seam label='useFeature("pro")'>
                <div className="flex flex-col gap-1.5">
                  <Label>Style</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ART_STYLES.map((s) => (
                      <StyleChip
                        key={s.id}
                        style={s}
                        selected={s.id === styleId}
                        locked={s.pro && !pro.enabled}
                        onSelect={() =>
                          s.pro && !pro.enabled
                            ? setUpgradeOpen(true)
                            : setStyleId(s.id)
                        }
                      />
                    ))}
                  </div>
                  {!pro.enabled ? (
                    <p className="text-xs text-muted-foreground">
                      Locked styles are part of{" "}
                      <button
                        type="button"
                        onClick={() => setUpgradeOpen(true)}
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        Prism Pro
                      </button>
                      .
                    </p>
                  ) : null}
                </div>
              </Seam>

              {/* Zero-config gate: when the wallet can't afford the action,
                  the default fallback ("Buy images") takes over on its own. */}
              <Seam label="<CreditGate cost={1}> · deduct(1)">
                <CreditGate cost={1}>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void generate()}
                    disabled={rendering || credits.confirming || !prompt.trim()}
                  >
                    {rendering ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Rendering…
                      </>
                    ) : (
                      "Generate · 1 image"
                    )}
                  </Button>
                </CreditGate>
              </Seam>
              {note ? (
                <p
                  role="status"
                  className="-mt-3 text-xs text-muted-foreground"
                >
                  {note}
                </p>
              ) : null}

              <div className="h-px bg-border" aria-hidden />

              {/* Zero-config gate: no fallback prop — the gate derives its own
                  "Unlock Commercial license" purchase button. */}
              <Seam label={`<FeatureGate feature="${LICENSE_FEATURE}">`}>
                <div className="flex flex-col gap-1.5">
                  <Label>Commercial license</Label>
                  <p className="text-xs text-muted-foreground">
                    One-time unlock so your renders can be used in client work.
                  </p>
                  <div className="pt-1">
                    <FeatureGate feature={LICENSE_FEATURE}>
                      <p className="flex items-center gap-2 text-sm">
                        <BadgeCheck
                          className="size-4 shrink-0 text-emerald-600"
                          aria-hidden
                        />
                        Licensed for commercial use
                      </p>
                    </FeatureGate>
                  </div>
                </div>
              </Seam>
            </aside>

            {/* Gallery */}
            <section className="flex flex-col gap-3 p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Your renders</h2>
                <span className="text-xs text-muted-foreground">
                  {artworks.length === 0
                    ? "This session"
                    : `${artworks.length} this session`}
                </span>
              </div>
              {artworks.length === 0 ? (
                <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center">
                  <ImageIcon className="size-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Nothing here yet</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Describe a scene and generate — your wallet was created
                    automatically, with free images every month.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {artworks.map((artwork) => (
                    <ArtworkTile
                      key={artwork.id}
                      artwork={artwork}
                      watermark={!pro.enabled}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Upgrade dialog opened from locked style chips (controlled). */}
        <PurchaseDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          filters={{ features: [PRO_FEATURE] }}
          title="Upgrade to Prism Pro"
          description="Premium styles and watermark-free renders — cancel anytime."
        />
      </div>
    </SeamsContext.Provider>
  );
}

function StyleChip({
  style,
  selected,
  locked,
  onSelect,
}: {
  style: ArtStyle;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-accent",
        locked && "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className="size-3 rounded-full"
        style={{
          background: `linear-gradient(135deg, ${style.colors[0]}, ${style.colors[1]})`,
        }}
      />
      {style.name}
      {locked ? (
        <Lock className="size-3" aria-hidden />
      ) : style.pro ? (
        <span className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">
          Pro
        </span>
      ) : null}
    </button>
  );
}

function ArtworkTile({
  artwork,
  watermark,
}: {
  artwork: Artwork;
  watermark: boolean;
}) {
  const style =
    ART_STYLES.find((s) => s.id === artwork.styleId) ?? ART_STYLES[0]!;

  if (!artwork.ready) {
    return (
      <div className="flex aspect-square animate-pulse flex-col items-center justify-center gap-2 rounded-xl border bg-muted text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-xs">Rendering…</span>
      </div>
    );
  }

  return (
    <figure className="group flex flex-col gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-500">
      <div className="relative aspect-square overflow-hidden rounded-xl border">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated inline SVG data URL */}
        <img
          src={artworkDataUrl(artwork.prompt, style, { watermark })}
          alt={`${artwork.prompt} — ${style.name} style`}
          className="size-full object-cover"
        />
        <button
          type="button"
          onClick={() => downloadArtwork(artwork, style, watermark)}
          aria-label="Download render"
          className="absolute top-2 right-2 rounded-md border bg-background/80 p-1.5 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Download className="size-3.5" />
        </button>
      </div>
      <figcaption className="truncate text-xs text-muted-foreground">
        {artwork.prompt} · {style.name}
      </figcaption>
    </figure>
  );
}

function downloadArtwork(
  artwork: Artwork,
  style: ArtStyle,
  watermark: boolean,
) {
  const svg = artworkSvg(artwork.prompt, style, { size: 1024, watermark });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `prism-${style.id}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
