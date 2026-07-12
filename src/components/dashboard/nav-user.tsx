import { CogIcon, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * Server-rendered account block at the bottom of the nav. Reads the session,
 * so it must sit inside a <Suspense> boundary (Cache Components).
 */
export async function NavUser() {
  const user = await requireUser();

  return (
    <div className="mt-2 flex items-center justify-between gap-2 border-t pt-3 pl-2.5">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium">
          {user.name || user.email}
        </span>
        {user.name ? (
          <span className="truncate text-[11px] text-muted-foreground">
            {user.email}
          </span>
        ) : null}
      </div>
      <Link href="/dashboard/settings" title="Settings">
        <CogIcon className="size-4 text-muted-foreground/70" />
        <span className="sr-only">Settings</span>
      </Link>
      <form action={logout}>
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          title="Sign out"
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" />
          <span className="sr-only">Sign out</span>
        </Button>
      </form>
    </div>
  );
}
