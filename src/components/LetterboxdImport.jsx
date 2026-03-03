// =====================================================
// LetterboxdImport – dual import modes:
//   MODE A – ZIP guided flow (new):
//     1. "Open Letterboxd export page" button
//     2. Drag / drop the downloaded ZIP
//     3. Extracts watched.csv + ratings.csv in-browser (no server needed)
//   MODE B – Manual CSV drag-and-drop (legacy, still supported)
//
// ZIP parsing: uses browser-native DecompressionStream (no external deps)
//   – Supported in Chrome 80+, Firefox 113+, Safari 16.4+ (our target)
// =====================================================
import React, { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Star, Eye, CheckCircle, X, Loader2, FileText,
  ExternalLink, Archive, ChevronRight, ArrowRight,
} from "lucide-react";
import useWatched from "@/hooks/useWatched";
import {
  parseLetterboxdCSV,
  mergeEntries,
  resolveToTMDB,
} from "../utils/letterboxdParser";

/* ------------------------------------------------------------------ */
/* In-browser ZIP extractor (no external library needed)               */
/* Uses Central Directory for reliability + DecompressionStream        */
/* ------------------------------------------------------------------ */
async function extractCsvFromZip(file) {
  const buf   = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const view  = new DataView(buf);

  // 1. Find End of Central Directory (EOCD) signature: PK\x05\x06
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Not a valid ZIP file — EOCD not found");

  const cdOffset  = view.getUint32(eocdOffset + 16, true);
  const cdEntries = view.getUint16(eocdOffset + 8, true);

  // 2. Walk Central Directory entries
  const result = {};
  let pos = cdOffset;

  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break; // sanity check

    const compression        = view.getUint16(pos + 10, true);
    const compressedSize     = view.getUint32(pos + 20, true);
    const fileNameLen        = view.getUint16(pos + 28, true);
    const extraLen           = view.getUint16(pos + 30, true);
    const commentLen         = view.getUint16(pos + 32, true);
    const localHeaderOffset  = view.getUint32(pos + 42, true);
    const fileNameBytes      = bytes.slice(pos + 46, pos + 46 + fileNameLen);
    const fileName           = new TextDecoder().decode(fileNameBytes);

    // Only extract CSV files
    if (fileName.endsWith(".csv")) {
      const localExtraLen    = view.getUint16(localHeaderOffset + 28, true);
      const localFileNameLen = view.getUint16(localHeaderOffset + 26, true);
      const dataStart        = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
      const compressed       = bytes.slice(dataStart, dataStart + compressedSize);

      let text;
      if (compression === 0) {
        // STORED — no compression
        text = new TextDecoder().decode(compressed);
      } else if (compression === 8) {
        // DEFLATE (most common)
        const ds     = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        writer.write(compressed);
        writer.close();
        const decompressed = await new Response(ds.readable).arrayBuffer();
        text = new TextDecoder().decode(decompressed);
      } else {
        throw new Error(`Unsupported ZIP compression method: ${compression}`);
      }

      // Use just the filename without path prefix (e.g. "letterboxd-data/ratings.csv" → "ratings.csv")
      const baseName = fileName.split("/").pop();
      if (baseName) result[baseName] = text;
    }

    pos += 46 + fileNameLen + extraLen + commentLen;
  }

  return result; // { "ratings.csv": "...", "watched.csv": "..." }
}

/* ------------------------------------------------------------------ */
/* Tiny helpers                                                         */
/* ------------------------------------------------------------------ */
function FileChip({ label, icon: Icon, count, onRemove }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="line-clamp-1 max-w-[180px]">{label}</span>
      {count != null && (
        <span className="ml-1 rounded-full bg-indigo-200 px-1.5 py-0.5 text-xs dark:bg-indigo-800">
          {count}
        </span>
      )}
      {onRemove && (
        <button onClick={onRemove} className="ml-1 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function Step({ num, label, done }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        done
          ? "bg-green-500 text-white"
          : "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400"
      }`}>
        {done ? "✓" : num}
      </div>
      <span className={`text-sm ${done ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}`}>
        {label}
      </span>
    </div>
  );
}

/* ================================================================ */
export default function LetterboxdImport() {
  const { bulkAdd, watched } = useWatched();

  /* ---- Mode ---- */
  const [mode, setMode] = useState("zip"); // "zip" | "csv"

  /* ---- ZIP flow state ---- */
  const [zipDragging, setZipDragging] = useState(false);
  const [zipError,    setZipError]    = useState(null);

  /* ---- Parsed state before resolution ---- */
  const [ratingsFile, setRatingsFile] = useState(null);
  const [watchedFile, setWatchedFile] = useState(null);

  /* ---- Resolution state ---- */
  const [phase, setPhase]         = useState("idle");
  const [progress, setProgress]   = useState({ current: 0, total: 0 });
  const [importedCount, setImportedCount] = useState(0);
  const [failedTitles, setFailedTitles]   = useState([]);
  const [newCount, setNewCount]   = useState(0);

  const abortRef   = useRef(null);
  const [csvDragging, setCsvDragging] = useState(false);

  /* ---- Parse a single CSV file ---- */
  const parseFile = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const { format, entries } = parseLetterboxdCSV(text);
      if (format === "ratings") {
        setRatingsFile({ name: file.name, entries });
      } else {
        setWatchedFile({ name: file.name, entries });
      }
      setPhase("preview");
    };
    reader.readAsText(file);
  }, []);

  const handleCsvFiles = useCallback(
    (files) => { Array.from(files).slice(0, 2).forEach(parseFile); },
    [parseFile]
  );

  /* ---- Shared ZIP processor — used by both drag-and-drop and file picker ---- */
  const processZipFile = useCallback(async (file) => {
    setZipError(null);
    try {
      const csvFiles = await extractCsvFromZip(file);
      let found = false;

      if (csvFiles["ratings.csv"]) {
        const { entries } = parseLetterboxdCSV(csvFiles["ratings.csv"]);
        setRatingsFile({ name: "ratings.csv", entries });
        found = true;
      }
      if (csvFiles["watched.csv"]) {
        const { entries } = parseLetterboxdCSV(csvFiles["watched.csv"]);
        setWatchedFile({ name: "watched.csv", entries });
        found = true;
      }

      if (!found) {
        setZipError("No ratings.csv or watched.csv found inside the ZIP. Make sure you exported from Letterboxd.");
        return;
      }
      setPhase("preview");
    } catch (err) {
      console.error("ZIP extraction failed", err);
      setZipError(`Could not read ZIP: ${err.message}`);
    }
  }, []);

  /* ---- ZIP drag-and-drop handler ---- */
  const handleZipDrop = useCallback(async (e) => {
    e.preventDefault();
    setZipDragging(false);
    const file = Array.from(e.dataTransfer.files).find(
      (f) => f.name.endsWith(".zip") || f.type === "application/zip"
    );
    if (!file) { setZipError("Please drop a .zip file."); return; }
    await processZipFile(file);
  }, [processZipFile]);

  /* ---- ZIP file picker (click / tap to browse) ---- */
  const handleZipInput = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting the same file
    await processZipFile(file);
  }, [processZipFile]);

  /* ---- Merged preview stats ---- */
  const merged = React.useMemo(() => {
    const r = ratingsFile?.entries ?? [];
    const w = watchedFile?.entries ?? [];
    if (!r.length && !w.length) return [];
    return mergeEntries(r, w);
  }, [ratingsFile, watchedFile]);

  const ratedCount = merged.filter((e) => e.rating != null).length;

  /* ---- Start resolution ---- */
  const startImport = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("resolving");
    setProgress({ current: 0, total: merged.length });
    setImportedCount(0);
    setFailedTitles([]);

    const batch = [];
    const { failed } = await resolveToTMDB({
      entries: merged,
      signal: controller.signal,
      onProgress: (cur, tot) => setProgress({ current: cur, total: tot }),
      onResult: (movie) => {
        batch.push(movie);
        setImportedCount((n) => n + 1);
      },
    });

    if (!controller.signal.aborted) {
      bulkAdd(batch);
      setNewCount(batch.length);
      setFailedTitles(failed);
      setPhase("done");
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase("idle");
    setProgress({ current: 0, total: 0 });
  };

  const reset = () => {
    setRatingsFile(null);
    setWatchedFile(null);
    setPhase("idle");
    setProgress({ current: 0, total: 0 });
    setImportedCount(0);
    setFailedTitles([]);
    setZipError(null);
  };

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  /* ================================================================ */
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <img
          src="https://a.ltrbxd.com/logos/letterboxd-logo-v-pos-rgb-500px.png"
          alt="Letterboxd"
          className="h-5 object-contain"
          onError={(e) => (e.target.style.display = "none")}
        />
        <div className="flex-1">
          <p className="font-semibold text-slate-800 dark:text-slate-100">Import from Letterboxd</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Bring your full diary into Umbrify</p>
        </div>

        {/* Mode toggle */}
        {phase === "idle" && (
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-700">
            {[
              { key: "zip", label: "ZIP", icon: Archive },
              { key: "csv", label: "CSV", icon: FileText },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setMode(key); setZipError(null); }}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  mode === key
                    ? "bg-white text-slate-800 shadow dark:bg-slate-600 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="p-5">
        <AnimatePresence mode="wait">

          {/* ══════════════════════════════ ZIP FLOW ══════════════════════════════ */}
          {mode === "zip" && phase === "idle" && (
            <motion.div key="zip-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

              {/* Step-by-step guide */}
              <div className="mb-5 space-y-3">
                <Step num={1} label="Go to your Letterboxd export page" />
                <Step num={2} label="Download the ZIP file" />
                <Step num={3} label="Tap the box below to choose it (or drag & drop) — we extract the CSVs for you" />
              </div>

              {/* CTA: open export page */}
              <a
                href="https://letterboxd.com/settings/data/"
                target="_blank"
                rel="noreferrer"
                className="mb-4 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800/50 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
              >
                <span className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Open Letterboxd Data Export
                </span>
                <ArrowRight className="h-4 w-4 opacity-60" />
              </a>

              {/* ZIP drop zone — also works as file picker on mobile */}
              <label
                htmlFor="lbxd-zip-input"
                onDragOver={(e) => { e.preventDefault(); setZipDragging(true); }}
                onDragLeave={() => setZipDragging(false)}
                onDrop={handleZipDrop}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 transition-colors ${
                  zipDragging
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                    : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700/40"
                }`}
              >
                <Archive className={`h-8 w-8 ${zipDragging ? "text-indigo-500" : "text-slate-400"}`} />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {zipDragging ? "Drop here!" : "Tap to choose the ZIP file"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    or drag & drop it — we'll extract ratings.csv & watched.csv automatically
                  </p>
                </div>
                <input
                  id="lbxd-zip-input"
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  className="hidden"
                  onChange={handleZipInput}
                />
              </label>

              {zipError && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  {zipError}
                </p>
              )}

              <button
                onClick={() => setMode("csv")}
                className="mt-4 text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
              >
                I have individual CSV files →
              </button>
            </motion.div>
          )}

          {/* ══════════════════════════════ CSV FLOW ══════════════════════════════ */}
          {mode === "csv" && phase === "idle" && (
            <motion.div key="csv-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <label
                htmlFor="lbxd-input"
                onDragOver={(e) => { e.preventDefault(); setCsvDragging(true); }}
                onDragLeave={() => setCsvDragging(false)}
                onDrop={(e) => { e.preventDefault(); setCsvDragging(false); handleCsvFiles(e.dataTransfer.files); }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 transition-colors ${
                  csvDragging
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                    : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700/40"
                }`}
              >
                <Upload className={`h-8 w-8 ${csvDragging ? "text-indigo-500" : "text-slate-400"}`} />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Drag & drop your CSV files here
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">ratings.csv</code>
                    {" "}and/or{" "}
                    <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">watched.csv</code>
                  </p>
                </div>
              </label>
              <input
                id="lbxd-input"
                type="file"
                accept=".csv,text/csv"
                multiple
                className="hidden"
                onChange={(e) => handleCsvFiles(e.target.files)}
              />
              <button
                onClick={() => setMode("zip")}
                className="mt-4 text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
              >
                ← Use ZIP import instead
              </button>
            </motion.div>
          )}

          {/* ══════════════════════════════ PREVIEW (both modes) ══════════════════ */}
          {phase === "preview" && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

              {/* Completed steps */}
              {mode === "zip" && (
                <div className="mb-4 space-y-2">
                  <Step num={1} label="Go to your Letterboxd export page" done />
                  <Step num={2} label="Download the ZIP file" done />
                  <Step num={3} label="Drop it here — we extract the CSVs for you" done />
                </div>
              )}

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {ratingsFile && (
                    <FileChip
                      label={ratingsFile.name}
                      icon={Star}
                      count={`${ratingsFile.entries.length} rated`}
                      onRemove={() => {
                        setRatingsFile(null);
                        if (!watchedFile) { setPhase("idle"); }
                      }}
                    />
                  )}
                  {watchedFile && (
                    <FileChip
                      label={watchedFile.name}
                      icon={Eye}
                      count={`${watchedFile.entries.length} watched`}
                      onRemove={() => {
                        setWatchedFile(null);
                        if (!ratingsFile) { setPhase("idle"); }
                      }}
                    />
                  )}
                </div>

                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-700/40">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Ready to import</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
                    <span><strong className="text-indigo-600 dark:text-indigo-400">{merged.length}</strong> total films</span>
                    <span><strong className="text-amber-600 dark:text-amber-400">{ratedCount}</strong> with ratings</span>
                    <span><strong className="text-slate-500">{merged.length - ratedCount}</strong> unrated</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Each film is looked up on TMDB — this takes ~{Math.ceil(merged.length / 4)} seconds
                  </p>
                </div>

                <button
                  onClick={startImport}
                  disabled={merged.length === 0}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  Import {merged.length} films →
                </button>
                <button onClick={reset} className="text-xs text-slate-400 hover:underline">
                  Cancel
                </button>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════ RESOLVING ══════════════════════════════ */}
          {phase === "resolving" && (
            <motion.div key="resolving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Resolving films on TMDB…
                </p>
              </div>

              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <motion.div
                  className="h-full rounded-full bg-indigo-500"
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {progress.current} / {progress.total} films (
                  <span className="font-semibold text-green-600 dark:text-green-400">{importedCount} matched</span>)
                </span>
                <span>{pct}%</span>
              </div>

              <button onClick={cancel} className="text-sm text-rose-500 hover:underline">Cancel</button>
            </motion.div>
          )}

          {/* ══════════════════════════════ DONE ══════════════════════════════════ */}
          {phase === "done" && (
            <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
                <p className="font-semibold">{newCount} films imported successfully!</p>
              </div>

              {failedTitles.length > 0 && (
                <details className="rounded-lg bg-amber-50 p-3 text-xs dark:bg-amber-900/20">
                  <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
                    {failedTitles.length} titles couldn't be matched on TMDB
                  </summary>
                  <ul className="mt-2 max-h-32 overflow-y-auto space-y-0.5 text-amber-600 dark:text-amber-300">
                    {failedTitles.map((t) => <li key={t}>• {t}</li>)}
                  </ul>
                </details>
              )}

              <button onClick={reset} className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
                Import another file
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
