import express, { NextFunction, Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import dotenv from "dotenv";
import Database from "better-sqlite3";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "horario.db");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const STATE_ID = "main_schedule";
const BACKUP_INTERVAL_MS = 5 * 60 * 60 * 1000;
const MAX_BACKUPS = 5;
const MAX_JSON_SIZE = "20mb";
const SESSION_COOKIE_NAME = "horario_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_CLEANUP_MS = 10 * 60 * 1000;
const LOGIN_FAIL_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_OFFENSE_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOGIN_FAILS_BEFORE_LOCK = 5;
const LOGIN_LOCK_STEPS_MS = [
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
];
const MAX_BODY_WRITES_PER_MINUTE = 120;
const AUTH_HEADER = "x-csrf-token";
const MAX_TEXT_SHORT = 120;
const MAX_TEXT_LONG = 1600;
const MAX_PHOTOS_PER_RECORD = 12;
const MAX_PHOTO_DATA_URL_LEN = 4_500_000;
const DAY_OF_WEEK_VALUES = new Set([0, 1, 2, 3, 4, 5, 6]);

const IS_PROD = process.env.NODE_ENV === "production";
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || "admin").trim();
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || (!IS_PROD ? "elmaster123" : "");
const ADMIN_PASSWORD_SET_AT = (process.env.ADMIN_PASSWORD_SET_AT || "").trim();
const ADMIN_PASSWORD_MAX_AGE_DAYS = Math.max(
  1,
  Number(process.env.ADMIN_PASSWORD_MAX_AGE_DAYS || 90),
);
const ADMIN_PASSWORD_STRONG = isStrongPassword(ADMIN_PASSWORD, ADMIN_USERNAME);
const ADMIN_PASSWORD_ROTATION_EXPIRED = isPasswordRotationExpired(
  ADMIN_PASSWORD_SET_AT,
  ADMIN_PASSWORD_MAX_AGE_DAYS,
);
const ADMIN_AUTH_READY = Boolean(
  ADMIN_PASSWORD &&
    ADMIN_PASSWORD_SET_AT &&
    ADMIN_PASSWORD_STRONG &&
    !ADMIN_PASSWORD_ROTATION_EXPIRED,
);

if (IS_PROD && !process.env.ADMIN_PASSWORD) {
  console.warn(
    "[SECURITY] ADMIN_PASSWORD no definido. El login admin quedara deshabilitado hasta configurarlo.",
  );
}
if (!ADMIN_PASSWORD_SET_AT) {
  console.warn(
    "[SECURITY] ADMIN_PASSWORD_SET_AT no definido. La rotacion obligatoria esta activa y bloqueara el login.",
  );
}
if (ADMIN_PASSWORD && !ADMIN_PASSWORD_STRONG) {
  console.warn(
    "[SECURITY] ADMIN_PASSWORD no cumple politica fuerte (12+, mayuscula, minuscula, numero, simbolo, sin username).",
  );
}
if (ADMIN_PASSWORD_SET_AT && ADMIN_PASSWORD_ROTATION_EXPIRED) {
  console.warn(
    `[SECURITY] ADMIN_PASSWORD expiro por rotacion (> ${ADMIN_PASSWORD_MAX_AGE_DAYS} dias). Actualiza ADMIN_PASSWORD y ADMIN_PASSWORD_SET_AT.`,
  );
}

function isStrongPassword(password: string, username: string) {
  if (password.length < 12) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[^\w\s]/.test(password)) return false;
  if (username && password.toLowerCase().includes(username.toLowerCase())) return false;
  return true;
}

function isPasswordRotationExpired(setAtRaw: string, maxAgeDays: number) {
  const setAtMs = Date.parse(setAtRaw);
  if (!Number.isFinite(setAtMs)) return true;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return Date.now() - setAtMs > maxAgeMs;
}

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

interface SessionEntry {
  token: string;
  username: string;
  csrfToken: string;
  expiresAt: number;
}

interface RateEntry {
  count: number;
  resetAt: number;
}

interface LoginGuardEntry {
  failCount: number;
  windowResetAt: number;
  lockedUntil: number;
  offenseCount: number;
  lastOffenseAt: number;
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
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
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

function parseCookies(req: Request) {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(";").forEach((chunk) => {
    const idx = chunk.indexOf("=");
    if (idx <= 0) return;
    const key = decodeURIComponent(chunk.slice(0, idx).trim());
    const value = decodeURIComponent(chunk.slice(idx + 1).trim());
    out[key] = value;
  });
  return out;
}

function createSessionCookie(token: string) {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  const secure = IS_PROD ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearSessionCookie() {
  const secure = IS_PROD ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}

function sanitizeText(value: unknown, maxLen = MAX_TEXT_SHORT) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function toSafeInt(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function isValidTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function isAllowedPhotoDataUrl(value: unknown) {
  if (typeof value !== "string") return false;
  if (value.length > MAX_PHOTO_DATA_URL_LEN) return false;
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
}

function normalizeDailyRecordPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const input = payload as Record<string, unknown>;

  const courseId = sanitizeText(input.courseId, 64);
  const courseName = sanitizeText(input.courseName, MAX_TEXT_SHORT);
  const classroomId = sanitizeText(input.classroomId, 64);
  const classroomName = sanitizeText(input.classroomName, MAX_TEXT_SHORT);
  const professor = sanitizeText(input.professor, MAX_TEXT_SHORT);
  const sessionId = sanitizeText(input.sessionId, 64) || undefined;
  const startTime = sanitizeText(input.startTime, 5);
  const endTime = sanitizeText(input.endTime, 5);
  const description = sanitizeText(input.description, MAX_TEXT_LONG);
  const dayOfWeek = toSafeInt(input.dayOfWeek, 0, 6);
  const studentsCount = input.studentsCount == null ? undefined : toSafeInt(input.studentsCount, 0, 500);

  if (!courseId || !courseName || !classroomId || !classroomName || !professor) {
    return null;
  }

  if (studentsCount === null) return null;
  if (startTime && !isValidTime(startTime)) return null;
  if (endTime && !isValidTime(endTime)) return null;
  if ((startTime && !endTime) || (!startTime && endTime)) return null;
  if (dayOfWeek !== null && !DAY_OF_WEEK_VALUES.has(dayOfWeek)) return null;

  const rawPhotos = Array.isArray(input.photos) ? input.photos : [];
  const photos = rawPhotos
    .slice(0, MAX_PHOTOS_PER_RECORD)
    .filter((photo) => isAllowedPhotoDataUrl(photo)) as string[];
  if (photos.length === 0) return null;

  return {
    sessionId,
    courseId,
    courseName,
    classroomId,
    classroomName,
    professor,
    startTime: startTime || undefined,
    endTime: endTime || undefined,
    dayOfWeek: dayOfWeek === null ? undefined : dayOfWeek,
    studentsCount,
    description,
    photos,
  };
}

function normalizeAppContent(content: unknown) {
  if (!content || typeof content !== "object") return null;
  const input = content as Record<string, unknown>;

  const classroomsIn = Array.isArray(input.classrooms) ? input.classrooms : null;
  const coursesIn = Array.isArray(input.courses) ? input.courses : null;
  const sessionsIn = Array.isArray(input.sessions) ? input.sessions : null;
  const professorsIn = Array.isArray(input.professors) ? input.professors : null;
  const historyIn = Array.isArray(input.historyLogs) ? input.historyLogs : [];

  if (!classroomsIn || !coursesIn || !sessionsIn || !professorsIn) return null;
  if (
    classroomsIn.length > 300 ||
    coursesIn.length > 600 ||
    sessionsIn.length > 6000 ||
    professorsIn.length > 1200 ||
    historyIn.length > 2000
  ) {
    return null;
  }

  return {
    classrooms: classroomsIn
      .map((c) => ({
        id: sanitizeText((c as Record<string, unknown>)?.id, 64),
        name: sanitizeText((c as Record<string, unknown>)?.name, MAX_TEXT_SHORT),
        pcCount: toSafeInt((c as Record<string, unknown>)?.pcCount, 0, 500) ?? 0,
      }))
      .filter((c) => c.id && c.name),
    courses: coursesIn
      .map((c) => ({
        id: sanitizeText((c as Record<string, unknown>)?.id, 64),
        name: sanitizeText((c as Record<string, unknown>)?.name, MAX_TEXT_SHORT),
        color: sanitizeText((c as Record<string, unknown>)?.color, 32),
      }))
      .filter((c) => c.id && c.name),
    sessions: sessionsIn
      .map((s) => {
        const raw = s as Record<string, unknown>;
        const day = toSafeInt(raw.dayOfWeek, 0, 6);
        const students = toSafeInt(raw.studentsCount, 0, 500);
        const startTime = sanitizeText(raw.startTime, 5);
        const endTime = sanitizeText(raw.endTime, 5);
        return {
          id: sanitizeText(raw.id, 64),
          courseId: sanitizeText(raw.courseId, 64),
          professor: sanitizeText(raw.professor, MAX_TEXT_SHORT),
          startTime,
          endTime,
          module: sanitizeText(raw.module, 32),
          studentsCount: students ?? 0,
          classroomId: sanitizeText(raw.classroomId, 64),
          dayOfWeek: day,
          groupId: sanitizeText(raw.groupId, 64) || undefined,
          isActive: raw.isActive !== false,
        };
      })
      .filter(
        (s) =>
          s.id &&
          s.courseId &&
          s.classroomId &&
          typeof s.dayOfWeek === "number" &&
          isValidTime(s.startTime) &&
          isValidTime(s.endTime),
      ),
    professors: professorsIn
      .map((p) => ({
        id: sanitizeText((p as Record<string, unknown>)?.id, 64),
        name: sanitizeText((p as Record<string, unknown>)?.name, MAX_TEXT_SHORT),
      }))
      .filter((p) => p.id && p.name),
    historyLogs: historyIn
      .map((h) => {
        const raw = h as Record<string, unknown>;
        const action = sanitizeText(raw.action, 16);
        if (!["add", "edit", "delete", "toggle"].includes(action)) return null;
        return {
          id: sanitizeText(raw.id, 64) || `${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
          action,
          courseName: sanitizeText(raw.courseName, MAX_TEXT_SHORT),
          description: sanitizeText(raw.description, MAX_TEXT_LONG),
          date: sanitizeText(raw.date, 40) || new Date().toISOString(),
        };
      })
      .filter(Boolean),
  };
}

async function startServer() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  const PORT = Number(process.env.PORT) || 3000;
  let db = createDatabase();
  let backupInProgress = false;
  const sessions = new Map<string, SessionEntry>();
  const loginGuardMap = new Map<string, LoginGuardEntry>();
  const writeRateMap = new Map<string, RateEntry>();

  const getRequestIp = (req: Request) => {
    const forwarded = req.headers["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (forwardedValue) return forwardedValue.split(",")[0].trim();
    return req.ip || "unknown";
  };

  const isRateLimited = (
    map: Map<string, RateEntry>,
    key: string,
    max: number,
    windowMs: number,
  ) => {
    const now = Date.now();
    const existing = map.get(key);
    if (!existing || existing.resetAt <= now) {
      map.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    existing.count += 1;
    map.set(key, existing);
    return existing.count > max;
  };

  const getOrInitLoginGuard = (key: string) => {
    const now = Date.now();
    const existing = loginGuardMap.get(key);
    if (!existing) {
      const created: LoginGuardEntry = {
        failCount: 0,
        windowResetAt: now + LOGIN_FAIL_WINDOW_MS,
        lockedUntil: 0,
        offenseCount: 0,
        lastOffenseAt: 0,
      };
      loginGuardMap.set(key, created);
      return created;
    }
    return existing;
  };

  const isLoginLocked = (key: string) => {
    const state = loginGuardMap.get(key);
    if (!state) return false;
    return state.lockedUntil > Date.now();
  };

  const registerLoginFailure = (key: string) => {
    const now = Date.now();
    const state = getOrInitLoginGuard(key);

    if (state.windowResetAt <= now) {
      state.failCount = 0;
      state.windowResetAt = now + LOGIN_FAIL_WINDOW_MS;
    }

    state.failCount += 1;
    if (state.failCount >= LOGIN_FAILS_BEFORE_LOCK) {
      if (state.lastOffenseAt + LOGIN_OFFENSE_WINDOW_MS < now) {
        state.offenseCount = 0;
      }
      const stepIndex = Math.min(state.offenseCount, LOGIN_LOCK_STEPS_MS.length - 1);
      state.lockedUntil = now + LOGIN_LOCK_STEPS_MS[stepIndex];
      state.offenseCount += 1;
      state.lastOffenseAt = now;
      state.failCount = 0;
      state.windowResetAt = now + LOGIN_FAIL_WINDOW_MS;
    }

    loginGuardMap.set(key, state);
    return state;
  };

  const clearLoginFailures = (key: string) => {
    const state = loginGuardMap.get(key);
    if (!state) return;
    state.failCount = 0;
    state.windowResetAt = Date.now() + LOGIN_FAIL_WINDOW_MS;
    state.lockedUntil = 0;
    loginGuardMap.set(key, state);
  };

  const createSession = (username: string) => {
    const token = crypto.randomBytes(48).toString("hex");
    const csrfToken = crypto.randomBytes(24).toString("hex");
    sessions.set(token, {
      token,
      username,
      csrfToken,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return { token, csrfToken };
  };

  const getSession = (req: Request) => {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  };

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    (req as Request & { adminSession?: SessionEntry }).adminSession = session;
    return next();
  };

  const requireCsrf = (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    const session = (req as Request & { adminSession?: SessionEntry }).adminSession;
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const incoming = String(req.headers[AUTH_HEADER] || "").trim();
    if (!incoming || incoming !== session.csrfToken) {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
    return next();
  };

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

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (IS_PROD) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.use(express.json({ limit: MAX_JSON_SIZE }));
  app.use((req, res, next) => {
    if (
      req.path.startsWith("/api/") &&
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.method !== "OPTIONS"
    ) {
      const key = `write:${getRequestIp(req)}`;
      if (isRateLimited(writeRateMap, key, MAX_BODY_WRITES_PER_MINUTE, 60_000)) {
        return res.status(429).json({ error: "Too many requests" });
      }
    }
    return next();
  });

  app.get("/api/auth/session", (req, res) => {
    const session = getSession(req);
    if (!session) {
      res.setHeader("Set-Cookie", clearSessionCookie());
      return res.status(200).json({ isAdmin: false });
    }
    return res.status(200).json({
      isAdmin: true,
      username: session.username,
      csrfToken: session.csrfToken,
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const ip = getRequestIp(req);
    const username = sanitizeText(req.body?.username, 80);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const userKey = `u:${username || "unknown"}`;
    const ipKey = `ip:${ip}`;
    const pairKey = `pair:${username || "unknown"}:${ip}`;
    const keys = [userKey, ipKey, pairKey];

    const blocked = keys.some((key) => isLoginLocked(key));
    if (blocked) {
      return res.status(429).json({ error: "Temporarily blocked due to repeated failed attempts" });
    }

    if (!ADMIN_AUTH_READY) {
      return res.status(503).json({
        error:
          "Admin login is disabled until password policy and rotation settings are valid",
      });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      keys.forEach((key) => registerLoginFailure(key));
      return res.status(401).json({ error: "Invalid credentials" });
    }

    keys.forEach((key) => clearLoginFailures(key));
    const { token, csrfToken } = createSession(username);
    res.setHeader("Set-Cookie", createSessionCookie(token));
    return res.status(200).json({ success: true, csrfToken });
  });

  app.post("/api/auth/logout", requireAdmin, requireCsrf, (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) sessions.delete(token);
    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.status(200).json({ success: true });
  });

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

      res.setHeader("Cache-Control", "no-store");
      return res.json({ content, updatedAt: row.updated_at });
    } catch (error) {
      console.error("Error loading data:", error);
      return res.status(500).json({ error: "Failed to load data" });
    }
  });

  app.put("/api/data", requireAdmin, requireCsrf, (req, res) => {
    try {
      const content = req.body;
      if (!content || typeof content !== "object") {
        return res.status(400).json({ error: "Invalid payload" });
      }

      // Ignore dailyRecords in monolithic updates to avoid accidental overwrite.
      if ("dailyRecords" in content) {
        delete (content as Record<string, unknown>).dailyRecords;
      }
      const normalized = normalizeAppContent(content);
      if (!normalized) {
        return res.status(400).json({ error: "Invalid data format" });
      }

      db.prepare(
        `
        INSERT INTO app_state (id, content, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(id)
        DO UPDATE SET content = excluded.content, updated_at = datetime('now')
      `,
      ).run(STATE_ID, JSON.stringify(normalized));

      return res.json({ success: true });
    } catch (error) {
      console.error("Error saving data:", error);
      return res.status(500).json({ error: "Failed to save data" });
    }
  });

  app.get("/api/records", requireAdmin, (_req, res) => {
    try {
      const records = readDailyRecords(db);
      return res.json({ records });
    } catch (error) {
      console.error("Error loading daily records:", error);
      return res.status(500).json({ error: "Failed to load records" });
    }
  });

  app.post("/api/records", requireAdmin, requireCsrf, (req, res) => {
    try {
      const normalized = normalizeDailyRecordPayload(req.body);
      if (!normalized) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const id = Date.now().toString() + Math.random().toString(36).substring(2);
      const createdAt = new Date().toISOString();
      const record = { ...normalized, id, createdAt };

      db.prepare("INSERT INTO daily_records (id, payload, created_at) VALUES (?, ?, ?)")
        .run(id, JSON.stringify(record), createdAt);

      return res.json({ success: true, record });
    } catch (error) {
      console.error("Error creating daily record:", error);
      return res.status(500).json({ error: "Failed to create record" });
    }
  });

  app.delete("/api/records/:id", requireAdmin, requireCsrf, (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!/^[a-zA-Z0-9_-]{6,128}$/.test(id)) {
        return res.status(400).json({ error: "Invalid id" });
      }

      db.prepare("DELETE FROM daily_records WHERE id = ?").run(id);
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting daily record:", error);
      return res.status(500).json({ error: "Failed to delete record" });
    }
  });

  app.put("/api/records/:id", requireAdmin, requireCsrf, (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!/^[a-zA-Z0-9_-]{6,128}$/.test(id)) {
        return res.status(400).json({ error: "Invalid id" });
      }

      const normalized = normalizeDailyRecordPayload(req.body);
      if (!normalized) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const existing = db
        .prepare("SELECT id, payload, created_at FROM daily_records WHERE id = ?")
        .get(id) as DailyRecordDb | undefined;

      if (!existing) {
        return res.status(404).json({ error: "Record not found" });
      }

      const createdAt = existing.created_at;
      const record = { ...normalized, id, createdAt };

      db.prepare("UPDATE daily_records SET payload = ? WHERE id = ?")
        .run(JSON.stringify(record), id);

      return res.json({ success: true, record });
    } catch (error) {
      console.error("Error updating daily record:", error);
      return res.status(500).json({ error: "Failed to update record" });
    }
  });

  app.get("/api/backups", requireAdmin, (_req, res) => {
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

  app.post("/api/backups/create", requireAdmin, requireCsrf, async (_req, res) => {
    try {
      const filename = await createBackup("manual");
      if (!filename) return res.status(500).json({ error: "Backup was not created" });
      return res.json({ success: true, filename });
    } catch (error) {
      console.error("Error creating manual backup:", error);
      return res.status(500).json({ error: "Failed to create backup" });
    }
  });

  app.post("/api/backups/restore", requireAdmin, requireCsrf, async (req, res) => {
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

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError) {
      return res.status(400).json({ error: "Malformed JSON body" });
    }
    return next(err);
  });

  setInterval(() => {
    void createBackup("auto");
  }, BACKUP_INTERVAL_MS);

  setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    for (const [key, entry] of loginGuardMap.entries()) {
      const idleTooLong = entry.lastOffenseAt > 0 && entry.lastOffenseAt + LOGIN_OFFENSE_WINDOW_MS < now;
      const noPending =
        entry.failCount === 0 && entry.lockedUntil <= now && (entry.offenseCount === 0 || idleTooLong);
      if (noPending) {
        loginGuardMap.delete(key);
      }
    }
    for (const [key, entry] of writeRateMap.entries()) {
      if (entry.resetAt <= now) writeRateMap.delete(key);
    }
  }, SESSION_CLEANUP_MS);

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
