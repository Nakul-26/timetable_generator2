import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // allowedHosts: [
    //   'timetable-generation.vercel.app',
    //   'https://b88667e37bd9.ngrok-free.app',
    //   'https://timetable-generation.vercel.app',
    //   "https://85d78eee2feb.ngrok-free.app",
    //   "cbecb374a20d.ngrok-free.app",
    //   'https://cbecb374a20d.ngrok-free.app/',
    //   'https://c1fffb40e2da.ngrok-free.app'
    // ]
  }
});