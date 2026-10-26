import { defineConfig } from "vite";
import path from "path";
import vue from "@vitejs/plugin-vue";

const devHost = process.env.TAURI_DEV_HOST || "127.0.0.1";

export default defineConfig({
  plugins: [vue()],
  root: "src-ui",
  base: "./",
  clearScreen: false,
  resolve: {
    alias: {
      vue: path.resolve(__dirname, "node_modules/vue/dist/vue.esm-bundler.js"),
    },
  },
  server: {
    host: devHost,
    port: 7120,
    strictPort: true,
    hmr: process.env.TAURI_DEV_HOST
      ? { protocol: "ws", host: process.env.TAURI_DEV_HOST, port: 7120 }
      : undefined,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2020",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "src-ui/index.html"),
        systemDictation: path.resolve(__dirname, "src-ui/system-dictation.html"),
      },
    },
  },
});
