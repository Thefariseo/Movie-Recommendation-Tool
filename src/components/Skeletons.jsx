import React from "react";

/** A grid of grey posters in the shape of the films on their way. */
export function PosterGridSkeleton({ count = 12, className = "grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6" }) {
  return (
    <div className={className} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2" aria-hidden="true">
          <div className="skeleton" style={{ aspectRatio: "2 / 3" }} />
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-2.5 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** The top of a page (a person, a list, a friend) while it loads. */
export function PageHeaderSkeleton({ portrait = false }) {
  return (
    <div className="flex items-start gap-6" aria-hidden="true">
      {portrait && <div className="skeleton w-32 shrink-0 sm:w-44" style={{ aspectRatio: "2 / 3" }} />}
      <div className="flex-1 space-y-3 pt-2">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton h-10 w-2/3 max-w-md" />
        <div className="skeleton h-3 w-full max-w-2xl" />
        <div className="skeleton h-3 w-5/6 max-w-xl" />
      </div>
    </div>
  );
}
