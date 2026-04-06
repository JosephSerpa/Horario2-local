import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "horario.db");
const STATE_ID = "main_schedule";

function readDefaultData() {
  const filePath = path.resolve(__dirname, "src/data.json");
  const file = fs.readFileSync(filePath, "utf8");
  return JSON.parse(file);
}

function createDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = DELETE");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const existing = db
    .prepare("SELECT id FROM app_state WHERE id = ?")
    .get(STATE_ID) as { id: string } | undefined;

  if (!existing) {
    const defaults = readDefaultData();
    db.prepare(
      `
      INSERT INTO app_state (id, content, updated_at)
      VALUES (?, ?, datetime('now'))
    `,
    ).run(STATE_ID, JSON.stringify(defaults));
  }

  return db;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const db = createDatabase();

  app.use(express.json({ limit: "50mb" }));

  app.get("/api/data", (_req, res) => {
    try {
      const row = db
        .prepare("SELECT content, updated_at FROM app_state WHERE id = ?")
        .get(STATE_ID) as { content: string; updated_at: string } | undefined;

      if (!row) {
        const defaults = readDefaultData();
        return res.json({ content: defaults, updatedAt: null });
      }

      const content = JSON.parse(row.content);
      return res.json({ content, updatedAt: row.updated_at });
    } catch (error) {
      console.error("Error loading data:", error);
      return res.status(500).json({ error: "Failed to load data" });
    }
  });

  app.put("/api/data", (req, res) => {
    try {
      const content = req.body;
      if (!content || typeof content !== "object") {
        return res.status(400).json({ error: "Invalid payload" });
      }

      db.prepare(
        `
        INSERT INTO app_state (id, content, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(id)
        DO UPDATE SET content = excluded.content, updated_at = datetime('now')
      `,
      ).run(STATE_ID, JSON.stringify(content));

      return res.json({ success: true });
    } catch (error) {
      console.error("Error saving data:", error);
      return res.status(500).json({ error: "Failed to save data" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
  });
}

startServer();
