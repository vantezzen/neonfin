import type { Metadata } from "next";
import Image from "next/image";
import appLogo from "@/app/icon.png";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Image src={appLogo} alt="neonFin" width={44} height={44} />
          <span className="text-lg font-semibold tracking-tight">neonFin</span>
        </div>
        {children}
      </div>
    </div>
  );
}
