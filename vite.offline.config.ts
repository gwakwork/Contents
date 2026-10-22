import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'release', emptyOutDir: false },
});
