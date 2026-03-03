import React, { useState, useEffect, useRef } from "react";
import { Upload } from "lucide-react";
import useWatched from "@/hooks/useWatched";
import { searchMovies } from "../utils/api";



export default function CSVImport() {
  const { bulkAdd } = useWatched();
  const [status, setStatus] = useState("");
  const PapaRef = useRef(null); 

  const handleFile = async (file) => {
    /* dynamic‑load Papaparse on demand */
    if (!PapaRef.current) {
      PapaRef.current = (await import("papaparse")).default;
    }

    setStatus("Parsing CSV…");
    PapaRef.current.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        try {
      /* ---------- 1. normalise row shape ---------- */
      const rows = data
        .map((r) => {
          const title =
            r.Title ||
            r.title ||
            r.Name ||          /* ← compatibile con export Letterboxd */
            r.name ||
            r["Film Name"] ||
            r["film name"];
          const year = Number(
            r.Year || r.year || r["Release Year"] || r["release year"]
          );
          const ratedRaw = Number(r.Rating || r.rating || r["Rating10"]);
          const rated = ratedRaw ? +(ratedRaw / 2).toFixed(1) : undefined; // 10 ➜ 5
          return title ? { title, year, rated } : null;
       })
        .filter(Boolean);      // scarta righe vuote
          /* resolve each title to TMDB id (sequence to stay under rate) */
          const resolved = [];
          for (const row of rows) {
            if (!row.title) continue;
            const res = await searchMovies(row.title, 1);
            const match =
              res.results.find(
                (m) => String(m.release_date).startsWith(row.year)
              ) || res.results[0];
            if (match) {
              resolved.push({
                id: match.id,
                title: match.title,
                poster: match.poster_path,
                genres: match.genre_ids,
                year: Number(match.release_date?.slice(0, 4)),
                rated: row.rated,
              });
            }
          }

          bulkAdd(resolved);
          setStatus(`Imported ${resolved.length} movies`);
        } catch (err) {
          console.error(err);
          setStatus("Import failed");
        }
      },
      error: () => setStatus("Parse error"),
    });
  };


  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <input
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        id="csv-input"
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <label
        htmlFor="csv-input"
        className="flex cursor-pointer flex-col items-center gap-2 text-indigo-600 hover:text-indigo-500"
      >
        <Upload className="h-6 w-6" />
        <span>Import watched list (CSV)</span>
      </label>
      {status && <p className="mt-2 text-sm text-slate-500">{status}</p>}
    </div>
  );
}