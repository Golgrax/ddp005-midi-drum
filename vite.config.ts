import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import express from 'express';
// @ts-ignore
import { apiRouter } from './api/presets.js';

const app = express();
app.use('/api', apiRouter);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'express-plugin',
      configureServer(server) {
        server.middlewares.use(app);
      }
    }
  ],
})