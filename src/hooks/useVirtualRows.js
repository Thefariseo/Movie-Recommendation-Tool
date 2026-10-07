// A long grid drawn a screenful at a time: only the rows in view (and a few
// either side) are in the page, with space kept for the rest, so a library of
// thousands of films scrolls as lightly as one of twenty.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Tailwind's breakpoints for the grid's column counts, widest first.
const columnsFor = (width, breakpoints) => breakpoints.find(([min]) => width >= min)?.[1] ?? breakpoints[breakpoints.length - 1][1];

/**
 * count: items; breakpoints: [[minWidth, columns], …] widest first;
 * gap: the rows' vertical gap in px; offset: where the first row starts below
 * the container's top. Returns the slice to draw and the space to keep above
 * and below it.
 */
export default function useVirtualRows({ count, breakpoints, gap = 20, offset = 0, overscan = 3, enabled = true }) {
  const [columns, setColumns] = useState(() => columnsFor(typeof window === "undefined" ? 1024 : window.innerWidth, breakpoints));
  const [rowHeight, setRowHeight] = useState(0);
  const [range, setRange] = useState([0, 8]);
  const container = useRef(null);
  const frame = useRef(0);
  const rows = Math.ceil(count / columns);

  const measure = useCallback(() => {
    const items = container.current?.querySelectorAll("[data-virtual-row-item]") || [];
    if (!items.length) return;
    // From one row to the next when two are drawn; else one card and the gap.
    const height = items.length > columns
      ? items[columns].getBoundingClientRect().top - items[0].getBoundingClientRect().top
      : items[0].getBoundingClientRect().height + gap;
    if (height > 0) setRowHeight(height);
  }, [gap, columns]);

  const update = useCallback(() => {
    frame.current = 0;
    const el = container.current;
    if (!el || !rowHeight) return;
    // Where row 0 starts (or would): `offset` below the container's top.
    const top = el.getBoundingClientRect().top + offset;
    const first = Math.max(0, Math.floor(-top / rowHeight) - overscan);
    const last = Math.min(rows, Math.ceil((window.innerHeight - top) / rowHeight) + overscan);
    setRange((prev) => (prev[0] === first && prev[1] === last ? prev : [first, last]));
  }, [rowHeight, rows, overscan, offset]);

  useEffect(() => {
    if (!enabled) return undefined;
    const schedule = () => { frame.current ||= requestAnimationFrame(update); };
    const resize = () => { setColumns(columnsFor(window.innerWidth, breakpoints)); measure(); schedule(); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [enabled, update, measure, breakpoints]);

  // The first rows drawn give the row height (it follows the column width).
  useLayoutEffect(() => { if (enabled) measure(); }, [enabled, measure, columns, count]);

  if (!enabled) return { container, start: 0, end: count, before: 0, after: 0 };
  const [first, last] = rowHeight ? range : [0, Math.min(rows, 8)];
  return {
    container,
    start: first * columns,
    end: Math.min(count, last * columns),
    before: first * rowHeight,
    after: Math.max(0, (rows - last) * rowHeight),
  };
}
