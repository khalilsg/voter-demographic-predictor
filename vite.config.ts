import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/web',
  // Relative asset URLs, so the same build works from a local file, from
  // `vite preview`, and from a GitHub Pages project subpath
  // (user.github.io/voter-demographic-predictor/) without a hardcoded base.
  // Safe here only because the app is a single page with no client router.
  base: './',
  plugins: [react()],
  build: { outDir: '../../dist', emptyOutDir: true },
});
