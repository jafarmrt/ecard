import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createApp, injectDynamicOpenGraph } from './src/server/app.ts';
import { db, getDataDir } from './src/server/db.ts';

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    // Vite is a build tool: loaded only in development so production needs no dev dependencies.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        const { html, status } = injectDynamicOpenGraph(template, req);
        res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => {
          // Hashed build assets never change; everything else must be revalidated.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    const indexPath = path.join(distPath, 'index.html');
    app.get('*', (req, res) => {
      if (!fs.existsSync(indexPath)) {
        res.status(404).send('Not found');
        return;
      }
      const { html, status } = injectDynamicOpenGraph(fs.readFileSync(indexPath, 'utf-8'), req);
      res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }).send(html);
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Roya Server] Application and API running on http://0.0.0.0:${PORT}`);
    console.log(`[Roya Server] Data directory: ${getDataDir()}`);
    db.getAllProfiles(); // create / migrate the database at startup so warnings show immediately
    runMaintenance();
  });

  // Daily: a consistent copy of the database in data/backups (14 kept) and removal of
  // uploaded files that no card uses any more (older than one day).
  function runMaintenance() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const hasToday = db.listSnapshots().some((s) => s.name.startsWith(`roya-daily-${today}`));
      if (!hasToday) db.snapshot('daily');
      db.pruneSnapshots(14);
      const removed = db.cleanupUploads();
      if (removed.length) {
        db.audit('cleanup', 'uploads', null, `${removed.length} فایل بدون استفاده حذف شد`);
        console.log(`[Roya Server] Removed ${removed.length} unused uploaded files.`);
      }
    } catch (err) {
      console.error('[Roya Server] Maintenance failed:', err);
    }
  }
  setInterval(runMaintenance, 6 * 60 * 60 * 1000).unref();

  // Write any batched analytics before the process exits.
  const shutdown = (signal: string) => {
    console.log(`[Roya Server] ${signal} received, saving data...`);
    db.flush();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[Roya Server] Failed to start server:', err);
  process.exit(1);
});
