import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const multiplayerServerURL = process.env.VITE_MULTIPLAYER_DEV_PROXY_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/polity": {
        target: multiplayerServerURL,
        changeOrigin: true
      },
      "/games": {
        target: multiplayerServerURL,
        changeOrigin: true
      },
      "/socket.io": {
        target: multiplayerServerURL,
        changeOrigin: true,
        ws: true
      }
    }
  }
});
