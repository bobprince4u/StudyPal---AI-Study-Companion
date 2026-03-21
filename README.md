# 📚 StudyPal — AI Study Companion

## Project Structure

```
studypal/
├── backend/       ← Node.js + Express API server
└── frontend/      ← Next.js UI
```

---

## Backend Setup (Node.js + Express)

```bash
cd backend
npm install
cp .env.example .env
# Add your free Gemini key to .env
# Get it at: https://aistudio.google.com/app/apikey
npm run dev
```

Runs on → **http://localhost:4000**

### API Endpoints

| Method | Route                     | Description                         |
| ------ | ------------------------- | ----------------------------------- |
| POST   | `/api/session`            | Create or resume a session          |
| POST   | `/api/ask`                | Ask a question (with optional file) |
| GET    | `/api/history/:username`  | Get question history                |
| GET    | `/api/progress/:username` | Get progress stats                  |

---

## Frontend Setup (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local
# .env.local already points to http://localhost:4000
npm run dev
```

Runs on → **http://localhost:3000**

---

## Run Both Together

Open two terminals:

**Terminal 1 — Backend:**

```bash
cd backend && npm run dev
```

**Terminal 2 — Frontend:**

```bash
cd frontend && npm run dev
```

Then open **http://localhost:3000**
