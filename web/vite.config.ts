import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.VITE_BACKEND_ORIGIN || "http://localhost:8000";
const proxy = {
  "/api": { target: backend, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, "") },
  "/ws": { target: backend, ws: true, changeOrigin: true },
};

export default defineConfig({ plugins: [react()], server: { proxy }, preview: { proxy } });
