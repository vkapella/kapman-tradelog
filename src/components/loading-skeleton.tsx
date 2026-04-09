interface LoadingSkeletonProps {
  lines?: number;
}

export function LoadingSkeleton({ lines = 3 }: LoadingSkeletonProps) {
  return (
    <div className="animate-pulse space-y-3 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-6" role="status" aria-live="polite">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="h-4 rounded bg-slate-700/70" />
      ))}
    </div>
  );
}
