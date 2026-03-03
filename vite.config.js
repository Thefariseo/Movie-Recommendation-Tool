/* =======================================================
   Vite + React configuration with handy aliases & env
   ======================================================= */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // Make env variables available on build as import.meta.env
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
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
      strictPort: true
    },
    build: {
      target: "es2018",
      outDir: "dist",
      emptyOutDir: true,
      minify: "esbuild",
      sourcemap: mode !== "production"
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