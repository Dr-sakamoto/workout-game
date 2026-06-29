import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages のプロジェクトサイト用ベースパス。
  // 公開URL: https://dr-sakamoto.github.io/workout-game/
  base: "/workout-game/",
  plugins: [react()],
  server: { host: true, port: 5173 },
});
