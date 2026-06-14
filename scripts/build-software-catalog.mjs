import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const keptIds = ['paper-04', 'paper-05', 'paper-07'];
const imagePaths = [
  'assets/images/paper-05-q001-01.png',
  'assets/images/paper-05-q002-01.png',
  'assets/images/paper-05-q002-02.png',
  'assets/images/paper-05-q003-01.png',
  'assets/images/paper-05-q003-02.png',
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), `${content.trim()}\n`, 'utf8');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cardHtml(paper, index) {
  const searchText = [paper.title, paper.course, ...paper.majors].join(' ').toLowerCase();
  const typeText = Object.entries(paper.type_counts)
    .map(([type, count]) => `${type} ${count}`)
    .join(' · ');
  const tags = paper.majors.map((major) => `<span>${escapeHtml(major)}</span>`).join('');
  const paperPath = `papers/${paper.id}.html`;
  const challengePath = `challenge.html?paper=${encodeURIComponent(paperPath)}`;

  return `      <article class="paper-card" data-category="软件工程" data-search="${escapeHtml(searchText)}">
        <div class="card-index">${String(index + 1).padStart(2, '0')}</div>
        <div class="card-main">
          <div class="card-meta">
            <span>软件工程</span>
            <time>${escapeHtml(paper.date)}</time>
          </div>
          <h2>${escapeHtml(paper.title)}</h2>
          <p>${escapeHtml(paper.course)}</p>
          <div class="tag-row">${tags}<span class="answer-badge">含快速刷题</span></div>
          <p class="card-types">${escapeHtml(typeText)}</p>
        </div>
        <div class="card-stats">
          <strong>${paper.question_count}</strong>
          <span>题</span>
          <small>${paper.total_score} 分</small>
        </div>
        <div class="card-link-group">
          <a class="card-link" href="${paperPath}" aria-label="开始作答：${escapeHtml(paper.title)}">开始作答 <span>↗</span></a>
          <a class="card-link challenge-link" href="${challengePath}" aria-label="20题闯关：${escapeHtml(paper.title)}">20题闯关 <span>↗</span></a>
        </div>
      </article>`;
}

const allPapers = readJson('data/papers.json');
const papers = keptIds.map((id) => allPapers.find((paper) => paper.id === id));
assert(papers.every(Boolean), '缺少待保留的软件工程试卷');
assert(papers.every((paper) => paper.category === '软件工程'), '保留列表中存在非软件工程试卷');
write('data/papers.json', JSON.stringify(papers, null, 2));

const audit = readJson('data/audit.json');
const auditPapers = keptIds.map((id) => audit.papers.find((paper) => paper.id === id));
assert(auditPapers.every(Boolean), '审计清单缺少待保留试卷');
write('data/audit.json', JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  paper_count: papers.length,
  question_count: papers.reduce((sum, paper) => sum + paper.question_count, 0),
  question_counts: papers.map((paper) => paper.question_count),
  image_count: imagePaths.length,
  papers: auditPapers,
}, null, 2));

const questionCount = papers.reduce((sum, paper) => sum + paper.question_count, 0);
const indexHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#164f3a">
  <meta name="description" content="3套软件工程试卷、26道题，支持模拟考试、快速刷题和20题闯关。">
  <title>软件工程考试与刷题</title>
  <link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="stylesheet" href="assets/style.css">
</head>
<body class="home-page">
  <a class="skip-link" href="#home-main">跳到试卷列表</a>
  <div class="grain" aria-hidden="true"></div>
  <header class="home-hero">
    <div class="hero-kicker">SOFTWARE ENGINEERING / 2026</div>
    <div class="hero-grid">
      <div>
        <h1>3份软件工程试卷，<br><em>共用一套刷题模块。</em></h1>
        <p>支持模拟考试、快速刷题和每组20题闯关；答题记录只保存在当前浏览器，也可安装后离线练习。</p>
      </div>
      <div class="hero-total">
        <strong>${questionCount}</strong>
        <span>道原题</span>
        <small>3 份软件工程试卷</small>
      </div>
    </div>
    <div class="hero-rule"></div>
  </header>

  <main class="home-main" id="home-main">
    <section class="catalog-toolbar" aria-label="试卷筛选">
      <div class="filter-row">
        <button class="filter-chip active" type="button" data-filter="全部">全部</button>
        <button class="filter-chip" type="button" data-filter="软件工程">软件工程</button>
      </div>
      <label class="search-box">
        <span>检索</span>
        <input id="paper-search" type="search" placeholder="课程、专业或试卷名">
      </label>
    </section>

    <section class="paper-list" id="paper-list">
${papers.map(cardHtml).join('\n\n')}
    </section>

    <p class="empty-state" id="empty-state" hidden>没有匹配的试卷，请换个关键词。</p>

    <section class="method-note">
      <div>
        <span class="eyebrow">整理说明</span>
        <h2>一套模块，三种练习方式。</h2>
      </div>
      <div class="method-columns">
        <p>本站只保留 3 份软件工程试卷、${questionCount} 道题，其他专业试卷已移除。</p>
        <p>所有试卷共用快速刷题、即时判定和20题闯关模块；不足20题的试卷按实际题数组成一组。</p>
        <p>本站不提供账号或云同步。禁止搜索收录只能降低被搜索到的概率，不等于访问密码保护。</p>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <span>软件工程在线与离线刷题</span>
    <span>更新日期：${new Date().toISOString().slice(0, 10)}</span>
  </footer>
  <script src="assets/ui.js"></script>
  <script src="assets/site.js"></script>
  <script src="assets/home.js"></script>
</body>
</html>`;
write('index.html', indexHtml);

const precache = [
  '',
  'index.html',
  'challenge.html',
  'offline.html',
  '404.html',
  'manifest.webmanifest',
  'assets/style.css',
  'assets/challenge.css',
  'assets/home.js',
  'assets/exam.js',
  'assets/challenge.js',
  'assets/practice-utils.js',
  'assets/ui.js',
  'assets/site.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'data/papers.json',
  'data/audit.json',
  ...papers.map((paper) => `papers/${paper.id}.html`),
  ...imagePaths,
].map((item) => `  './${item}',`).join('\n');

const serviceWorker = `const CACHE_NAME = 'software-engineering-exam-v5';
const PRECACHE = [
${precache}
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => (await caches.match(event.request, { ignoreSearch: true })) || caches.match('./offline.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});`;
write('sw.js', serviceWorker);

console.log(`Built software catalog: ${papers.length} papers, ${questionCount} questions.`);
