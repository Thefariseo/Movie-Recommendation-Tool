/* =======================================================
   Vite + React configuration with handy aliases & env
   ======================================================= */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";


// Points public/lang-preload.js at each dictionary's built file, so it can
// start that download as early as the app's own.
const preloadDictionaries = () => ({
  name: "preload-dictionaries",
  transformIndexHtml: {
    order: "post",
    handler(html, ctx) {
      if (!ctx.bundle) return html;
      const files = Object.values(ctx.bundle)
        .filter((c) => c.type === "chunk" && /src\/i18n\/([a-z]{2})\.js$/.test(c.facadeModuleId || ""))
        .map((c) => [c.facadeModuleId.match(/([a-z]{2})\.js$/)[1], c.fileName]);
      const attrs = files.map(([lang, file]) => ` data-${lang}="/${file}"`).join("");
      return html.replace('<script src="/lang-preload.js"></script>', `<script src="/lang-preload.js"${attrs}></script>`);
    },
  },
});

export default defineConfig(({ mode }) => {
  // Make env variables available on build as import.meta.env
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), preloadDictionaries()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),          // e.g. import foo from '@/components/Foo'
        "~": path.resolve(__dirname, "src/components")
      }
    },
    define: {
      // Short helper if you ever need process.env in libs:
      "process.env": {}
    },
    css: {
      postcss: {
        // Ensures Tailwind + Autoprefixer pick up PostCSS config automatically
      }
    },
    server: {
      port: 5173,
      open: true,
      strictPort: true,
      proxy: { "/api": "http://127.0.0.1:3001" }
    },
    build: {
      target: "es2018",
      outDir: "dist",
      emptyOutDir: true,
      minify: "esbuild",
      sourcemap: mode !== "production",
      rollupOptions: {
        output: {
          // Libraries change less often than the app: in their own files they
          // stay in the browser's cache across releases.
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            icons: ["lucide-react"]
          }
        }
      }
    },
    preview: {
      port: 4173,
      strictPort: true
    },

    /* ----------------------------------------
       Environment injection for TMDB key
       ---------------------------------------- */
    envPrefix: ["VITE_"],          // Default, explicit for clarity
    defineEnv: {
      VITE_TMDB_KEY: env.VITE_TMDB_KEY
    }
  };
});
