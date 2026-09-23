import React, { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";

const ORIGIN = "https://www.youtube-nocookie.com";

// Plays the first trailer that YouTube will actually embed. Owners can forbid
// embedding and videos can be region-blocked; the player reports that as an
// error, and the next candidate is tried. When none plays, the member gets a
// link to watch it on YouTube instead of a dead "Video unavailable" box.
export default function TrailerPlayer({ keys, title, onClose }) {
  const [index, setIndex] = useState(0);
  const frame = useRef(null);
  const box = useRef(null);
  const key = keys[index];
  const current = useRef(key);
  current.current = key;

  // Opened from the button lower down, the player sits at the top of the card.
  useEffect(() => {
    box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== ORIGIN || e.source !== frame.current?.contentWindow)
        return;
      let data;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      // One error moves on once, even if the player repeats it.
      if (data?.event === "onError" && data.id === current.current) {
        current.current = null;
        setIndex((i) => i + 1);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The player only reports events to a page that asked to listen.
  const listen = () =>
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: key, channel: "widget" }),
      ORIGIN,
    );

  return (
    <div ref={box}>
      {/* An inline ratio: the aspect-ratio plugin in tailwind.config.cjs turns
          off Tailwind's own aspect utilities, so the 16:9 class produced no CSS
          and the player had no height (sound, but nothing on screen). */}
      <div className="relative bg-black" style={{ aspectRatio: "16 / 9" }}>
        {key ? (
          <iframe
            ref={frame}
            key={key}
            className="absolute inset-0 h-full w-full"
            src={`${ORIGIN}/embed/${key}?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            title={`${title} — Trailer`}
            onLoad={listen}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white">
            <p>YouTube won't play this trailer inside Umbrify.</p>
            <a
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 font-medium hover:bg-red-500"
              href={`https://www.youtube.com/watch?v=${keys[0]}`}
              target="_blank"
              rel="noreferrer"
            >
              Watch on YouTube <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
        <div className="absolute right-3 top-3 z-10 flex gap-2">
          {key && (
            <a
              href={`https://www.youtube.com/watch?v=${key}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the trailer on YouTube"
              className="rounded-full bg-black/70 p-1.5 text-white backdrop-blur hover:bg-black"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trailer"
            className="rounded-full bg-black/70 p-1.5 text-white backdrop-blur hover:bg-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {key && (
        <p className="bg-black px-3 py-1.5 text-right text-[11px] text-slate-400">
          Not playing?{" "}
          <a
            className="underline hover:text-white"
            href={`https://www.youtube.com/watch?v=${key}`}
            target="_blank"
            rel="noreferrer"
          >
            Watch it on YouTube
          </a>
          {index + 1 < keys.length && (
            <>
              {" "}
              ·{" "}
              <button
                type="button"
                className="underline hover:text-white"
                onClick={() => setIndex((i) => i + 1)}
              >
                try another trailer
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
