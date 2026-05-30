# Neural Portfolio — Anjaneya Bhardwaj

A fullscreen neural network portfolio rendered on an HTML5 canvas. Each layer of the network corresponds to a section of the resume. Click any anchor node to open its inspector panel.

Live at **[anjaneyabhardwaj.com](https://anjaneyabhardwaj.com)**

---

## Features

- **7-layer neural network** — BIOGRAPHY → SKILLS → PROJECTS → CV → CONTACT → KELEX
- **Named nodes** — skill nodes (PYTORCH, LANGGRAPH, GNN, POSTGRES, DOCKER, RL) and project nodes wired with explicit skill→project edges
- **3D depth** — subtle parallax and auto-rotation driven by mouse position
- **Inspector panels** — click any anchor or named node to open a full content panel
- **Kelex RAG** — retrieval-augmented chat over biography, resume, and projects via Groq (`llama-3.1-8b-instant`)
- **CONSOLE** — live tweaks for theme (dark/light), layout, depth, density, and serif voice
- **Tour** — guided first-visit walkthrough with spotlight
- **Mobile** — touch pan, pinch-to-zoom, vertical layout, bottom sheet panels
- **Pure HTML/CSS/JS** — no framework, no build step

---

## Project Structure

```
public/               # Everything Vercel serves
  index.html          # Page shell
  portfolio.css       # All styles
  portfolio.data.json # Structured content (layers, projects, skills, CV, contact)
  content/
    bio.md            # Biography copy
    resume.md         # Resume copy (used by RAG)
    projects.md       # Projects copy (used by RAG)
  js/
    config.js         # Tweak defaults + density profiles
    data.js           # Async content loader
    network.js        # Canvas engine (nodes, edges, particles, 3D, Kelex glyph)
    panels.js         # Inspector panel + section renderers
    rag.js            # TF cosine retrieval + Groq API call
    console.js        # CONSOLE tweaks panel
    tour.js           # First-visit walkthrough
    main.js           # Boot glue + HUD tickers
  uploads/            # Resume PDF + photos
api/
  chat.js             # Vercel serverless function → Groq proxy
server.js             # Local dev server (static files + /api/chat proxy)
vercel.json           # Vercel config
```

---

## Updating Content

No JavaScript needed — just edit these files and deploy:

| What | File |
|------|------|
| Bio text | `public/content/bio.md` |
| Resume text | `public/content/resume.md` |
| Projects text | `public/content/projects.md` |
| Projects, skills, CV, contact | `public/portfolio.data.json` |

---

## Local Development

```sh
cp .env.example .env
# Add your GROQ_API_KEY to .env
npm install
node server.js
# Open http://localhost:3000
```

---

## Deployment

Hosted on **Vercel** with a custom domain via GoDaddy DNS.

```sh
vercel --prod
```

Environment variable required in Vercel dashboard:
- `GROQ_API_KEY` — from [console.groq.com](https://console.groq.com)
