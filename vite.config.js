import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  const clientPort = parseInt(env.CLIENT_PORT) || 3000;
  const serverPort = parseInt(env.SERVER_PORT) || 3001;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      port: clientPort,
      strictPort: true,
      hmr: {
        port: clientPort,
      },
    },
    // Expose server port to the frontend for API URL construction
    define: {
      __SERVER_PORT__: JSON.stringify(serverPort),
    },
  };
});
