import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors());
app.use(express.json());

// ── Database setup ─────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, "studypal.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    topic TEXT DEFAULT 'Study Topic',
    has_file INTEGER DEFAULT 0,
    filename TEXT,
    created_at TEXT NOT NULL
  );
`);

// ── POST /api/session ──────────────────────────────────────────────────────
app.post("/api/session", (req, res) => {
  const { username } = req.body;
  if (!username?.trim())
    return res.status(400).json({ error: "Username required" });

  db.prepare(
    "INSERT OR IGNORE INTO sessions (username, created_at) VALUES (?, ?)",
  ).run(username.trim(), new Date().toISOString());
  const session = db
    .prepare("SELECT * FROM sessions WHERE username = ?")
    .get(username.trim());
  res.json({ username: session.username, created_at: session.created_at });
});

// ── POST /api/ask ──────────────────────────────────────────────────────────
app.post("/api/ask", upload.single("file"), async (req, res) => {
  const { username, question } = req.body;
  if (!username || !question?.trim())
    return res.status(400).json({ error: "Username and question required" });

  const systemPrompt = `You are StudyPal, a warm and encouraging AI study companion for secondary school and university students in Africa.

When a student asks a question or uploads a document:
1. Give a clear, simple explanation suited to their level (4-6 sentences)
2. Provide exactly 2 practice questions with model answers
3. End with one short encouraging sentence

Return a JSON object with these exact keys:
- explanation: string
- topic: specific 2-4 word subject name (e.g. "Nouns", "Photosynthesis", "Quadratic Equations") — never use "General"
- practice_questions: array of 2 objects each with "question" and "answer" keys
- encouragement: string`;

  const contents = [
    {
      role: "user",
      parts: [{ text: systemPrompt + "\n\nStudent question: " + question }],
    },
  ];

  let hasFile = false;
  let filename = null;

  if (req.file) {
    hasFile = true;
    filename = req.file.originalname;
    const ext = filename.split(".").pop().toLowerCase();
    const base64 = req.file.buffer.toString("base64");

    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      contents[0].parts.push({ inlineData: { data: base64, mimeType } });
    } else if (ext === "pdf") {
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const data = await pdfParse(req.file.buffer);
        contents[0].parts.push({
          text: `\n[Uploaded PDF content]:\n${data.text.slice(0, 4000)}`,
        });
      } catch {
        contents[0].parts.push({
          text: "\n[A PDF was uploaded but could not be parsed.]",
        });
      }
    } else {
      contents[0].parts.push({
        text: `\n[Uploaded file content]:\n${req.file.buffer.toString("utf-8").slice(0, 4000)}`,
      });
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: { responseMimeType: "application/json" },
    });

    const raw = response.text.trim();

    let answerData;
    try {
      answerData = JSON.parse(raw);
    } catch {
      const clean = raw.replace(/^```json|^```|```$/gm, "").trim();
      try {
        answerData = JSON.parse(clean);
      } catch {
        answerData = {
          explanation: raw,
          topic: "Study Topic",
          practice_questions: [],
          encouragement: "Keep going!",
        };
      }
    }

    db.prepare(
      `INSERT INTO questions (username, question, answer, topic, has_file, filename, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      username,
      question,
      JSON.stringify(answerData),
      answerData.topic || "Study Topic",
      hasFile ? 1 : 0,
      filename,
      new Date().toISOString(),
    );

    res.json(answerData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI request failed: " + err.message });
  }
});

// ── GET /api/history/:username ─────────────────────────────────────────────
app.get("/api/history/:username", (req, res) => {
  const rows = db
    .prepare(
      `SELECT question, answer, topic, has_file, filename, created_at FROM questions WHERE username = ? ORDER BY created_at DESC LIMIT 30`,
    )
    .all(req.params.username);
  const history = rows.map((row) => {
    let answer;
    try {
      answer = JSON.parse(row.answer);
    } catch {
      answer = { explanation: row.answer };
    }
    return {
      question: row.question,
      answer,
      topic: row.topic,
      has_file: Boolean(row.has_file),
      filename: row.filename,
      created_at: row.created_at,
    };
  });
  res.json(history);
});

// ── GET /api/progress/:username ────────────────────────────────────────────
app.get("/api/progress/:username", (req, res) => {
  const total = db
    .prepare("SELECT COUNT(*) as c FROM questions WHERE username = ?")
    .get(req.params.username).c;
  const topics = db
    .prepare(
      `SELECT topic, COUNT(*) as count FROM questions WHERE username = ? GROUP BY topic ORDER BY count DESC LIMIT 6`,
    )
    .all(req.params.username);
  res.json({ total_questions: total, topics });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(` StudyPal backend running on http://localhost:${PORT}`),
);
