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
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const STATE_ID = "main_schedule";
const BACKUP_INTERVAL_MS = 5 * 60 * 60 * 1000;
const MAX_BACKUPS = 5;

interface BackupEntry {
  filename: string;
  fullPath: string;
  size: number;
  createdAt: string;
}

interface DailyRecordDb {
  id: string;
  payload: string;
  created_at: string;
}

function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function readDefaultData() {
  const filePath = path.resolve(__dirname, "src/data.json");
  const file = fs.readFileSync(filePath, "utf8");
  return JSON.parse(file);
}

function createDatabase() {
  ensureDataDirs();

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = DELETE");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_records (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
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

  // One-time migration from legacy JSON state dailyRecords -> daily_records table.
  const recordsCount = db
    .prepare("SELECT COUNT(1) as count FROM daily_records")
    .get() as { count: number };

  if (recordsCount.count === 0) {
    const stateRow = db
      .prepare("SELECT content FROM app_state WHERE id = ?")
      .get(STATE_ID) as { content: string } | undefined;

    if (stateRow) {
      try {
        const parsed = JSON.parse(stateRow.content);
        const legacy = Array.isArray(parsed?.dailyRecords) ? parsed.dailyRecords : [];

        if (legacy.length > 0) {
          const insertStmt = db.prepare(
            "INSERT OR REPLACE INTO daily_records (id, payload, created_at) VALUES (?, ?, ?)",
          );
          const tx = db.transaction((rows: any[]) => {
            rows.forEach((record) => {
              const id = String(record?.id || Date.now().toString() + Math.random().toString(36).slice(2));
              const createdAt = String(record?.createdAt || new Date().toISOString());
              insertStmt.run(id, JSON.stringify({ ...record, id, createdAt }), createdAt);
            });
          });
          tx(legacy);
        }
      } catch (error) {
        console.error("Legacy dailyRecords migration failed:", error);
      }
    }
  }

  return db;
}

function getTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function listBackups(): BackupEntry[] {
  ensureDataDirs();

  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((name) => name.endsWith(".db"))
    .map((filename) => {
      const fullPath = path.join(BACKUPS_DIR, filename);
      const stat = fs.statSync(fullPath);
      return {
        filename,
        fullPath,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return files;
}

function pruneOldBackups() {
  const backups = listBackups();
  const toDelete = backups.slice(MAX_BACKUPS);
  toDelete.forEach((entry) => {
    try {
      fs.unlinkSync(entry.fullPath);
    } catch (error) {
      console.error("Error deleting old backup:", entry.fullPath, error);
    }
  });
}

function isSafeBackupFilename(name: string) {
  return /^backup-\d{8}-\d{6}\.db$/.test(name);
}

function readDailyRecords(db: Database.Database) {
  const rows = db
    .prepare("SELECT id, payload, created_at FROM daily_records ORDER BY datetime(created_at) DESC")
    .all() as DailyRecordDb[];

  return rows
    .map((row) => {
      try {
        return JSON.parse(row.payload);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  let db = createDatabase();
  let backupInProgress = false;

  const createBackup = async (reason: "auto" | "manual" | "pre-restore" = "auto") => {
    if (backupInProgress) return null;

    backupInProgress = true;
    try {
      ensureDataDirs();
      const filename = `backup-${getTimestamp()}.db`;
      const fullPath = path.join(BACKUPS_DIR, filename);
      await db.backup(fullPath);
      pruneOldBackups();
      console.log(`Backup created (${reason}): ${filename}`);
      return filename;
    } catch (error) {
      console.error("Backup creation failed:", error);
      return null;
    } finally {
      backupInProgress = false;
    }
  };

  app.use(express.json({ limit: "80mb" }));

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
      // Source of truth for dailyRecords is daily_records table.
      if (content && typeof content === "object" && "dailyRecords" in content) {
        delete content.dailyRecords;
      }

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

      // Ignore dailyRecords in monolithic updates to avoid accidental overwrite.
      if ("dailyRecords" in content) {
        delete (content as Record<string, unknown>).dailyRecords;
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

  app.get("/api/records", (_req, res) => {
    try {
      const records = readDailyRecords(db);
      return res.json({ records });
    } catch (error) {
      console.error("Error loading daily records:", error);
      return res.status(500).json({ error: "Failed to load records" });
    }
  });

  app.post("/api/records", (req, res) => {
    try {
      const incoming = req.body;
      if (!incoming || typeof incoming !== "object") {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const id = Date.now().toString() + Math.random().toString(36).substring(2);
      const createdAt = new Date().toISOString();
      const record = { ...(incoming as Record<string, unknown>), id, createdAt };

      db.prepare("INSERT INTO daily_records (id, payload, created_at) VALUES (?, ?, ?)")
        .run(id, JSON.stringify(record), createdAt);

      return res.json({ success: true, record });
    } catch (error) {
      console.error("Error creating daily record:", error);
      return res.status(500).json({ error: "Failed to create record" });
    }
  });

  app.delete("/api/records/:id", (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ error: "Invalid id" });

      db.prepare("DELETE FROM daily_records WHERE id = ?").run(id);
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting daily record:", error);
      return res.status(500).json({ error: "Failed to delete record" });
    }
  });

  app.get("/api/backups", (_req, res) => {
    try {
      const backups = listBackups().map((entry) => ({
        filename: entry.filename,
        size: entry.size,
        createdAt: entry.createdAt,
      }));
      return res.json({ backups });
    } catch (error) {
      console.error("Error listing backups:", error);
      return res.status(500).json({ error: "Failed to list backups" });
    }
  });

  app.post("/api/backups/create", async (_req, res) => {
    try {
      const filename = await createBackup("manual");
      if (!filename) return res.status(500).json({ error: "Backup was not created" });
      return res.json({ success: true, filename });
    } catch (error) {
      console.error("Error creating manual backup:", error);
      return res.status(500).json({ error: "Failed to create backup" });
    }
  });

  app.post("/api/backups/restore", async (req, res) => {
    try {
      const filename = String(req.body?.filename || "").trim();
      if (!isSafeBackupFilename(filename)) {
        return res.status(400).json({ error: "Invalid backup filename" });
      }

      const targetPath = path.join(BACKUPS_DIR, filename);
      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ error: "Backup not found" });
      }

      await createBackup("pre-restore");
      db.close();
      fs.copyFileSync(targetPath, DB_PATH);
      db = createDatabase();

      return res.json({ success: true });
    } catch (error) {
      console.error("Error restoring backup:", error);
      return res.status(500).json({ error: "Failed to restore backup" });
    }
  });

  setInterval(() => {
    void createBackup("auto");
  }, BACKUP_INTERVAL_MS);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
    console.log(`Backups folder: ${BACKUPS_DIR}`);
  });
}

startServer();
