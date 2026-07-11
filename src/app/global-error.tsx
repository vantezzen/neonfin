"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="m-0 grid min-h-svh place-items-center bg-zinc-50 p-6 font-sans text-zinc-950">
        <main className="max-w-md rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="m-0 text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Please try again. If this persists, use the reference below when
            contacting support.
          </p>
          {error.digest ? (
            <code className="mt-3 block text-xs text-zinc-500">
              {error.digest}
            </code>
          ) : null}
          <button
            type="button"
            onClick={unstable_retry}
            className="mt-5 rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
