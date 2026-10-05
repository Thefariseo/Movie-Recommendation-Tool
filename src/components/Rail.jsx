import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { reducedMotion } from "../utils/motion";

/**
 * A horizontal row of films that snaps to its cards, with arrows over its
 * edges on hover (none at the start or the end, none on touch screens).
 */
export default function Rail({ as: Tag = "div", className = "", label, children, ...rest }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, children]);
  const scroll = (direction) => ref.current?.scrollBy({ left: direction * ref.current.clientWidth * 0.85, behavior: reducedMotion() ? "instant" : "smooth" });
  return (
    <div className="rail">
      <Tag ref={ref} className={`snap-row ${className}`} onScroll={measure} aria-label={label} {...rest}>{children}</Tag>
      {!edges.start && <button type="button" className="rail-arrow rail-prev" onClick={() => scroll(-1)} aria-label="Previous films"><ChevronLeft size={20} /></button>}
      {!edges.end && <button type="button" className="rail-arrow rail-next" onClick={() => scroll(1)} aria-label="More films"><ChevronRight size={20} /></button>}
    </div>
  );
}
