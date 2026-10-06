import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    // Cargo writes and locks executable files below this folder while `tauri dev`
    // is running. Watching it on Windows can crash Vite with EBUSY.
    watch: {
      ignored: ["**/src-tauri/target/**"],
    },
  },
  build: {
    target: "es2021",
  },
});
