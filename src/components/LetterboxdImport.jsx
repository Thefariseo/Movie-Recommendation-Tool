// =====================================================
// LetterboxdImport – dual-file drop zone with live progress
// Accepts: ratings.csv + watched.csv (one or both, any order)
// =====================================================
import React, { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Star,
  Eye,
  CheckCircle,
  XCircle,
  X,
  Loader2,
  FileText,
} from "lucide-react";
import useWatched from "@/hooks/useWatched";
import {
  parseLetterboxdCSV,
  mergeEntries,
  resolveToTMDB,
} from "../utils/letterboxdParser";

/* ---- tiny helper ---- */
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
        <button
          onClick={onRemove}
          className="ml-1 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ================================================================ */
export default function LetterboxdImport() {
  const { bulkAdd, watched } = useWatched();

  // Parsed state before resolution
  const [ratingsFile, setRatingsFile] = useState(null);  // { name, entries }
  const [watchedFile, setWatchedFile] = useState(null);  // { name, entries }

  // Resolution state
  const [phase, setPhase] = useState("idle"); // idle | preview | resolving | done | error
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importedCount, setImportedCount] = useState(0);
  const [failedTitles, setFailedTitles] = useState([]);
  const [newCount, setNewCount] = useState(0);

  const abortRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  /* ---- Parse a file and slot into ratings or watched ---- */
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

  const handleFiles = useCallback(
    (files) => {
      Array.from(files).slice(0, 2).forEach(parseFile);
    },
    [parseFile]
  );

  /* ---- Drag-and-drop ---- */
  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  /* ---- Merged preview stats ---- */
  const merged = React.useMemo(() => {
    const r = ratingsFile?.entries ?? [];
    const w = watchedFile?.entries ?? [];
    if (!r.length && !w.length) return [];
    return mergeEntries(r, w);
  }, [ratingsFile, watchedFile]);

  const ratedCount = merged.filter((e) => e.rating != null).length;
  const alreadyHave = merged.filter((e) =>
    watched.some((w) => {
      const key = e.uri || `${e.title.toLowerCase()}|${e.year}`;
      return false; // we don't have URI on watched entries, just count new
    })
  ).length;

  /* ---- Start resolution ---- */
  const startImport = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("resolving");
    setProgress({ current: 0, total: merged.length });
    setImportedCount(0);
    setFailedTitles([]);

    const batch = [];
    const { resolved, failed } = await resolveToTMDB({
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
  };

  const pct =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  /* ================================================================ */
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <img
          src="https://a.ltrbxd.com/logos/letterboxd-logo-v-pos-rgb-500px.png"
          alt="Letterboxd"
          className="h-5 object-contain"
          onError={(e) => (e.target.style.display = "none")}
        />
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">
            Import from Letterboxd
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Drop your{" "}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">
              ratings.csv
            </code>{" "}
            and/or{" "}
            <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">
              watched.csv
            </code>
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        <AnimatePresence mode="wait">
          {/* ── IDLE / PREVIEW ── */}
          {(phase === "idle" || phase === "preview") && (
            <motion.div
              key="drop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Drop zone */}
              <label
                htmlFor="lbxd-input"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 transition-colors ${
                  dragging
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                    : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700/40"
                }`}
              >
                <Upload
                  className={`h-8 w-8 ${
                    dragging ? "text-indigo-500" : "text-slate-400"
                  }`}
                />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Drag & drop your CSV files here
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    or click to browse
                  </p>
                </div>
              </label>
              <input
                id="lbxd-input"
                type="file"
                accept=".csv,text/csv"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />

              {/* File chips */}
              {(ratingsFile || watchedFile) && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {ratingsFile && (
                      <FileChip
                        label={ratingsFile.name}
                        icon={Star}
                        count={`${ratingsFile.entries.length} rated`}
                        onRemove={() => {
                          setRatingsFile(null);
                          if (!watchedFile) setPhase("idle");
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
                          if (!ratingsFile) setPhase("idle");
                        }}
                      />
                    )}
                  </div>

                  {/* Preview stats */}
                  <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-700/40">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Ready to import
                    </p>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
                      <span>
                        <strong className="text-indigo-600 dark:text-indigo-400">
                          {merged.length}
                        </strong>{" "}
                        total films
                      </span>
                      <span>
                        <strong className="text-amber-600 dark:text-amber-400">
                          {ratedCount}
                        </strong>{" "}
                        with ratings
                      </span>
                      <span>
                        <strong className="text-slate-500">
                          {merged.length - ratedCount}
                        </strong>{" "}
                        unrated
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Each film is looked up on TMDB — this takes ~
                      {Math.ceil(merged.length / 4)} seconds
                    </p>
                  </div>

                  <button
                    onClick={startImport}
                    disabled={merged.length === 0}
                    className="btn-primary w-full justify-center disabled:opacity-50"
                  >
                    Import {merged.length} films →
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ── RESOLVING ── */}
          {phase === "resolving" && (
            <motion.div
              key="resolving"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Resolving films on TMDB…
                </p>
              </div>

              {/* Progress bar */}
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
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {importedCount} matched
                  </span>
                  )
                </span>
                <span>{pct}%</span>
              </div>

              <button
                onClick={cancel}
                className="text-sm text-rose-500 hover:underline"
              >
                Cancel
              </button>
            </motion.div>
          )}

          {/* ── DONE ── */}
          {phase === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
                <p className="font-semibold">
                  {newCount} films imported successfully!
                </p>
              </div>

              {failedTitles.length > 0 && (
                <details className="rounded-lg bg-amber-50 p-3 text-xs dark:bg-amber-900/20">
                  <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
                    {failedTitles.length} titles couldn't be matched on TMDB
                  </summary>
                  <ul className="mt-2 max-h-32 overflow-y-auto space-y-0.5 text-amber-600 dark:text-amber-300">
                    {failedTitles.map((t) => (
                      <li key={t}>• {t}</li>
                    ))}
                  </ul>
                </details>
              )}

              <button
                onClick={reset}
                className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Import another file
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
