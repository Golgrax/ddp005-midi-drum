// api/presets.js (Vite Backend Integration)
import Database from 'better-sqlite3';
import express from 'express';
import cors from 'cors';

const db = new Database('drumkit.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export const apiRouter = express.Router();

apiRouter.use(cors());
apiRouter.use(express.json({ limit: '50mb' }));

apiRouter.get('/presets', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM presets ORDER BY created_at DESC');
    const presets = stmt.all();
    const parsed = presets.map((p) => ({
        ...p,
        data: JSON.parse(p.data)
    }));
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.post('/presets', (req, res) => {
  try {
    const { id, name, data } = req.body;
    const stmt = db.prepare('INSERT OR REPLACE INTO presets (id, name, data) VALUES (?, ?, ?)');
    stmt.run(id, name, JSON.stringify(data));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

apiRouter.delete('/presets/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM presets WHERE id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
