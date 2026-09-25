import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // One immutable build works at both /jtcc-group-e/ and /versions/vX.Y.Z/.
  base: './',
  plugins: [react()],
})
