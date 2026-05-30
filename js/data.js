// ============================================================
// data.js — Async loader for portfolio content (markdown) and
// structured data (JSON). Exposes `dataReady` promise; everything
// that touches data must `await dataReady` first (main.js does).
// ============================================================

// Will be populated after fetch
let BIO_TEXT      = '';
let RESUME_TEXT   = '';
let PROJECTS_TEXT = '';

let LAYERS        = [];
let PROJECT_SKILLS = {};
let ANCHOR_HEADER  = {};
let ASIDES         = {};
let SKILL_LABEL    = {};
let PROJECTS       = [];
let SKILL_GROUPS   = [];
let CV_ROWS        = [];
let CV_FOOTER      = {};
let CONTACT        = { left:[], right:[] };

const dataReady = (async () => {
  const [bio, resume, projects, data] = await Promise.all([
    fetch('content/bio.md').then(r => r.text()),
    fetch('content/resume.md').then(r => r.text()),
    fetch('content/projects.md').then(r => r.text()),
    fetch('portfolio.data.json').then(r => r.json()),
  ]);
  BIO_TEXT      = bio.trim();
  RESUME_TEXT   = resume.trim();
  PROJECTS_TEXT = projects.trim();

  LAYERS         = data.layers;
  PROJECT_SKILLS = data.projectSkills;
  ANCHOR_HEADER  = data.anchorHeader;
  ASIDES         = data.asides;
  SKILL_LABEL    = data.skillLabel;
  PROJECTS       = data.projects;
  SKILL_GROUPS   = data.skillGroups;
  CV_ROWS        = data.cv;
  CV_FOOTER      = data.cvFooter;
  CONTACT        = data.contact;
})();
