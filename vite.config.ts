import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { loadWclEnv } from './server/env';

/** Mounts the /api handler inside the Vite dev server so one command runs everything. */
function api(): Plugin {
  return {
    name: 'parsecheck-api',
    async configureServer(server) {
      const { createApiHandler } = await server.ssrLoadModule('/server/handler.ts');
      server.middlewares.use(createApiHandler());
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === 'serve' && !process.env.VITEST) loadWclEnv(import.meta.dirname);
  return {
    plugins: [react(), api()],
    test: { include: ['tests/**/*.test.ts'] },
  };
});
