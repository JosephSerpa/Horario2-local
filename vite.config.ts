import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const allowedHosts = (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1,horario.sprintperu.com')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts,
    },
  };
});
