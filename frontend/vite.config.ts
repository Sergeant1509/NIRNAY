import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': { target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000', changeOrigin: true } } },
});