"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  Boxes,
  LayoutGrid,
  Menu,
  Plug,
  Receipt,
  Wallet,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import appLogo from "@/app/icon.png";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const MAIN = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid, exact: true },
  { href: "/dashboard/projects", label: "Projects", icon: Boxes },
  { href: "/dashboard/wallets", label: "Wallets", icon: Wallet },
  { href: "/dashboard/orders", label: "Orders", icon: Receipt },
] as const;

const PAYMENTS = [
  { href: "/dashboard/providers", label: "Providers", icon: Plug },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
] as const;

type Surface = "canvas" | "panel";

function NavLink({
  href,
  label,
  icon: Icon,
  exact,
  surface,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  surface: Surface;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? surface === "canvas"
            ? "bg-background text-foreground shadow-xs ring-1 ring-foreground/[0.06]"
            : "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4",
          active ? "text-foreground" : "text-muted-foreground/70",
        )}
      />
      {label}
    </Link>
  );
}

function NavSections({
  surface,
  onNavigate,
}: {
  surface: Surface;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        {MAIN.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            surface={surface}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground/60 uppercase">
          Payments
        </span>
        {PAYMENTS.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            surface={surface}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

function DocsLink() {
  return (
    <a
      href="/docs"
      target="_blank"
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <BookOpen className="size-4 text-muted-foreground/70" />
      Documentation
      <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground/50" />
    </a>
  );
}

/** Desktop sidebar - sits directly on the gray canvas, no border or fill. */
export function DashboardNav({ footer }: { footer?: React.ReactNode }) {
  return (
    <nav className="flex h-full flex-col overflow-y-auto px-4 py-5">
      <Link href="/dashboard" className="mb-7 flex items-center gap-2.5 px-1.5">
        <Image
          src={appLogo}
          alt=""
          width={26}
          height={26}
          className="rounded-md"
        />
        <span className="text-sm font-semibold tracking-tight">neonFin</span>
      </Link>

      <NavSections surface="canvas" />

      <div className="mt-auto flex flex-col gap-0.5 pt-6">
        <DocsLink />
        {footer}
      </div>
    </nav>
  );
}

/** Mobile top bar with a slide-in sheet holding the same navigation. */
export function MobileNav({ footer }: { footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="flex items-center justify-between px-4 py-3 lg:hidden">
      <Link href="/dashboard" className="flex items-center gap-2">
        <Image
          src={appLogo}
          alt=""
          width={24}
          height={24}
          className="rounded-md"
        />
        <span className="text-sm font-semibold tracking-tight">neonFin</span>
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          }
        />
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <nav className="flex h-full flex-col overflow-y-auto px-4 py-5">
            <Link
              href="/dashboard"
              onClick={close}
              className="mb-7 flex items-center gap-2.5 px-1.5"
            >
              <Image
                src={appLogo}
                alt=""
                width={26}
                height={26}
                className="rounded-md"
              />
              <span className="text-sm font-semibold tracking-tight">
                neonFin
              </span>
            </Link>
            <NavSections surface="panel" onNavigate={close} />
            <div className="mt-auto flex flex-col gap-0.5 pt-6">
              <DocsLink />
              {footer}
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
