import React from "react";
import { useActivity, useBusy } from "../utils/activity";

/** The thin red bar along the top while a page or its films load. */
export default function TopProgress() {
  const busy = useBusy();
  return <div className={`top-progress ${busy ? "active" : ""}`} role="progressbar" aria-hidden={!busy} aria-label="Loading" />;
}

/** In place of a page while it loads: the space it will take, and the bar above. */
export function PageLoading() {
  useActivity();
  return <div className="min-h-screen" role="status" aria-label="Loading" data-page-loading />;
}
