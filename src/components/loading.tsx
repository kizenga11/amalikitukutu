"use client";

type SkeletonProps = {
  className?: string;
  style?: React.CSSProperties;
};

export function Skeleton({ className, style }: SkeletonProps) {
  return <div className={`skeleton ${className ?? ""}`} style={style} aria-hidden="true" />;
}

export function Spinner({ size = 22 }: { size?: number }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="stat-card stat-card--skeleton">
      <div className="stat-top">
        <Skeleton className="skeleton--icon" />
      </div>
      <Skeleton className="skeleton--value" />
      <Skeleton className="skeleton--label" />
    </div>
  );
}

export function PanelSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="panel panel--skeleton">
      <div className="panel-head">
        <div className="panel-head-skeleton">
          <Skeleton className="skeleton--title" />
          <Skeleton className="skeleton--sub" />
        </div>
        <Skeleton className="skeleton--badge" />
      </div>
      <div className="panel-body-skeleton">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="skeleton--bar" />
        ))}
      </div>
    </div>
  );
}

export function ListRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="skeleton-row">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className="skeleton--cell"
          style={{ width: `${Math.max(28, 70 - (i * 8))}%` }}
        />
      ))}
    </div>
  );
}

export function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="card-skeleton" />
      ))}
    </>
  );
}