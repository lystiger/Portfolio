import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/hero-scene.tsx',
      name: 'HeroCanvas',
      fileName: () => 'hero-canvas.js',
      formats: ['es']
    },
    outDir: 'dist',
    emptyOutDir: false
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
});
