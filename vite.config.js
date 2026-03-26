// vite.config.js
export default {
  server: {
    open: true,
    port: 5173
  },
  esbuild: {
    drop: ['console'],
  },
}
