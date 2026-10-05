import React, { useEffect, useRef, useState } from "react";
import { movieTitle } from "../utils/api";
import { knownTitle, needsTitle } from "../utils/titleStore";

/**
 * A film's title in the interface language. A saved film's title is looked
 * up once it comes near the screen (a library can hold hundreds of films),
 * and remembered.
 */
export default function FilmTitle({ film }) {
  const ref = useRef(null);
  const [title, setTitle] = useState(() => knownTitle(film));
  useEffect(() => {
    setTitle(knownTitle(film));
    if (!needsTitle(film) || !ref.current || typeof IntersectionObserver === "undefined") return undefined;
    let live = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      movieTitle(film.id).then((t) => { if (live && t) setTitle(t); }).catch(() => {});
    }, { rootMargin: "400px" });
    observer.observe(ref.current);
    return () => { live = false; observer.disconnect(); };
  }, [film?.id, film?.title, film?.original_title]);
  return <span ref={ref}>{title}</span>;
}
