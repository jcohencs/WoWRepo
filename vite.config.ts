import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

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

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'WCL_'));
  return {
    plugins: [react(), api()],
    test: { include: ['tests/**/*.test.ts'] },
  };
});
