import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Windows locks audio files while they stream; watching them crashes the dev server
    watch: { ignored: ['**/public/audio/**'] }
  },
  build: { chunkSizeWarningLimit: 1300 }
});
