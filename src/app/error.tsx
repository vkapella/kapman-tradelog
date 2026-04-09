"use client";

import { useEffect } from "react";

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-slate-950 p-8 text-slate-100">
        <h1 className="text-2xl font-semibold">Application Error</h1>
        <p className="mt-2 text-sm text-slate-300">An unexpected error occurred while rendering this page.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm"
        >
          Retry
        </button>
      </body>
    </html>
  );
}
