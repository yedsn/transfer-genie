import { defineConfig } from "vite";
import path from "path";
import vue from "@vitejs/plugin-vue";

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
    host: "127.0.0.1",
    port: 3180,
    strictPort: true,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2020",
  },
});
