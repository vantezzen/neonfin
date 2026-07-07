"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readWalletCode, WALLET_QUERY_PARAM } from "@/lib/neonfin/qr";

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BarcodeDetectorInstance;

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: BarcodeDetectorConstructor;
};

export type WalletQrScannerProps = {
  param?: string;
  onCode: (code: string) => void;
};

export function WalletQrScanner({
  param = WALLET_QUERY_PARAM,
  onCode,
}: WalletQrScannerProps) {
  const [available, setAvailable] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const detector = (window as WindowWithBarcodeDetector).BarcodeDetector;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- scanner availability is browser-only feature detection.
    setAvailable(!!detector && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let frame = 0;

    async function start() {
      try {
        const Detector = (window as WindowWithBarcodeDetector).BarcodeDetector;
        if (!Detector || !videoRef.current) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({ formats: ["qr_code"] });

        async function tick() {
          if (cancelled || !videoRef.current) return;
          const codes = await detector.detect(videoRef.current).catch(() => []);
          const raw = codes[0]?.rawValue;
          const code = raw ? readWalletCode(raw, param) : null;
          if (code) {
            onCode(code);
            setActive(false);
            return;
          }
          frame = requestAnimationFrame(tick);
        }

        frame = requestAnimationFrame(tick);
      } catch {
        setError("Couldn't access the camera.");
        setActive(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active, onCode, param]);

  if (!available) return null;

  return active ? (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border bg-black">
        <video ref={videoRef} muted playsInline className="aspect-video w-full" />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setActive(false)}
      >
        <X className="size-4" />
        Stop scanning
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setActive(true);
        }}
      >
        <Camera className="size-4" />
        Scan QR code
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
