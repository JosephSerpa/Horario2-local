import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.post("/api/save", (req, res) => {
    try {
      const data = req.body;
      const filePath = path.resolve(__dirname, "src/data.json");
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving data:", error);
      res.status(500).json({ error: "Failed to save data" });
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
  });
}

startServer();
