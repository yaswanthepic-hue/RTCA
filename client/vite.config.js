import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv with '' prefix loads ALL env vars (including non-VITE_ ones).
  // BACKEND_URL is not VITE_-prefixed so it is never bundled into the client.
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.BACKEND_URL || 'http://localhost:5000'

  return {
    plugins: [react()],
    publicDir: 'public',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      copyPublicDir: true
    },
    server: {
      proxy: {
        // Proxy all /api requests → backend (hides the real server URL in network tab)
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
        // Proxy Socket.IO through the dev server as well
        '/socket.io': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
          ws: true, // enable WebSocket proxying
        },
        // Proxy uploaded media files so file URLs never expose the backend host
        '/uploads': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})

