import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Local-only bridge for the Calendar Edge Function. The browser calls
        // Vite on its own origin, avoiding CORS while the function is redeployed.
        '/supabase-functions/google-calendar': {
          target: env.VITE_SUPABASE_URL,
          changeOrigin: true,
          rewrite: () => '/functions/v1/google-calendar',
        },
      },
    },
  };
})
