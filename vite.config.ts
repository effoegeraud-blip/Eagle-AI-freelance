import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Le front appelle /api/* → serveur Express (webhook + checkout)
    proxy: { '/api': 'http://localhost:3001' },
  },
});
