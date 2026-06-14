import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const practice = require(path.join(root, 'assets', 'practice-utils.js'));
const paperSpecs = [
  { id: 'paper-04', count: 1 },
  { id: 'paper-05', count: 3 },
  { id: 'paper-07', count: 22 },
];
const paperFiles = paperSpecs.map(({ id }) => `papers/${id}.html`);
const htmlFiles = ['index.html', 'challenge.html', 'offline.html', '404.html', ...paperFiles];
const removedPaperIds = ['paper-01', 'paper-02', 'paper-03', 'paper-06', 'paper-08', 'paper-09', 'paper-10', 'paper-11'];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function paperData(relativePath) {
  const match = read(relativePath).match(/<script id="exam-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert(match, `${relativePath} 缺少 exam-data`);
  return JSON.parse(match[1]);
}

function verifyInternalLinks(relativePath) {
  const links = [...read(relativePath).matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(?:#|https?:|mailto:|data:|javascript:)/.test(link)) continue;
    const clean = decodeURIComponent(link.split(/[?#]/)[0]);
    if (!clean) continue;
    const target = path.resolve(root, path.dirname(relativePath), clean);
    assert(fs.existsSync(target), `${relativePath} 的内部资源不存在：${link}`);
  }
}

const papers = paperFiles.map(paperData);
assert.deepEqual(papers.map((paper) => paper.id), paperSpecs.map(({ id }) => id), '只允许保留三份软件工程试卷');
assert.deepEqual(papers.map((paper) => paper.question_count), paperSpecs.map(({ count }) => count), '各试卷题数不匹配');
assert.equal(papers.reduce((sum, paper) => sum + paper.question_count, 0), 26, '总题数必须为26');

papers.forEach((paper, index) => {
  assert.equal(paper.category, '软件工程', `${paper.id} 不是软件工程试卷`);
  assert.equal(paper.questions.length, paperSpecs[index].count, `${paper.id} questions数组数量不匹配`);
  assert.equal(paper.has_answers, true, `${paper.id} 必须支持快速刷题`);
  paper.questions.forEach((question) => {
    assert(question.reference, `${paper.id} 第${question.number}题缺少答案`);
    assert(question.reference.answer.length > 0, `${paper.id} 第${question.number}题答案为空`);
    assert(question.reference.explanation, `${paper.id} 第${question.number}题解析为空`);
    assert(question.reference.source, `${paper.id} 第${question.number}题出处为空`);
    assert(question.reference.basis, `${paper.id} 第${question.number}题依据为空`);
  });
});

const paper04 = papers[0];
assert.equal(paper04.questions[0].reference.answer.length, 7, '边界值案例必须包含7个完美边界值');
const paper05 = papers[1];
assert.match(paper05.questions[0].reference.answer.join(' '), /E1=平台管理员/);
assert.match(paper05.questions[2].reference.answer.join(' '), /D4=治疗意见文件/);
const paper07 = papers[2];
assert(practice.isCorrect(paper07.questions[0], 'A'), '软件工程判断题应支持即时判定');
assert(practice.isCorrect(paper07.questions[5], ['需求模型', '分析模型', '设计模型', '实现模型', '测试模型']), 'OOSE五类模型答案应判定正确');
assert.equal(practice.answerLabel(paper07.questions[2]), 'B', '共享模块应格式化客观题答案');
assert.match(practice.answerLabel(paper04.questions[0]), /-1：B/, '共享模块应格式化主观题答案');

const catalog = JSON.parse(read('data/papers.json'));
assert.deepEqual(catalog.map((paper) => paper.id), paperSpecs.map(({ id }) => id), '数据目录含有非软件工程试卷');
const audit = JSON.parse(read('data/audit.json'));
assert.equal(audit.paper_count, 3);
assert.equal(audit.question_count, 26);
assert.equal(audit.image_count, 5);

const indexHtml = read('index.html');
assert.equal((indexHtml.match(/class="card-link challenge-link"/g) || []).length, 3, '首页必须包含3个闯关入口');
assert.equal((indexHtml.match(/class="paper-card"/g) || []).length, 3, '首页必须只显示3张试卷卡片');
assert(!/大数据|Web 开发|网络与安全/.test(indexHtml), '首页仍含其他专业内容');

const manifest = JSON.parse(read('manifest.webmanifest'));
assert.match(manifest.name, /软件工程/);
assert(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'), 'manifest缺少192x192 PNG图标');
assert(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'), 'manifest缺少512x512 PNG图标');

const challengeJs = read('assets/challenge.js');
assert(/const answerLabel = practice\.answerLabel/.test(challengeJs), '20题闯关必须复用共享答案模块');
assert(/papers\/paper-07\.html/.test(challengeJs), '闯关默认试卷必须指向保留页面');
assert(/reference\.explanation/.test(challengeJs), '闯关解析必须使用题目reference.explanation');

const examJs = read('assets/exam.js');
assert(/const answerLabel = practiceUtils\.answerLabel/.test(examJs), '快速刷题必须复用共享答案模块');
assert(/const raw = question\.reference\?\.explanation/.test(examJs), '快速刷题解析必须使用题目reference.explanation');
assert(!/explanationRules|NameNode|MapReduce|HDFS/.test(examJs), '快速刷题模块仍含大数据专用解析');

for (const relativePath of paperFiles) {
  const html = read(relativePath);
  assert(/assets\/practice-utils\.js/.test(html), `${relativePath} 未加载共享判题模块`);
  assert(/assets\/exam\.js/.test(html), `${relativePath} 未加载共享快速刷题模块`);
}

for (const id of removedPaperIds) {
  assert(!fs.existsSync(path.join(root, 'papers', `${id}.html`)), `${id} 仍未删除`);
}

for (const relativePath of htmlFiles) {
  const html = read(relativePath);
  assert(/<meta name="robots" content="noindex,nofollow">/.test(html), `${relativePath} 缺少noindex`);
  assert(!/\bwindow\.(?:alert|confirm)\s*\(|(^|[^\w.])alert\s*\(/m.test(html), `${relativePath} 仍含原生弹窗`);
  verifyInternalLinks(relativePath);
}

const jsFiles = fs.readdirSync(path.join(root, 'assets'))
  .filter((file) => file.endsWith('.js'))
  .map((file) => `assets/${file}`)
  .concat(['sw.js']);
for (const relativePath of jsFiles) {
  const source = read(relativePath);
  new vm.Script(source, { filename: relativePath });
}

const serviceWorker = read('sw.js');
for (const relativePath of [...paperFiles, 'index.html', 'challenge.html', 'offline.html']) {
  assert(serviceWorker.includes(`./${relativePath}`), `离线缓存缺少${relativePath}`);
}
for (const id of removedPaperIds) {
  assert(!serviceWorker.includes(id), `离线缓存仍含${id}`);
}

console.log('Validation passed: 3 software-engineering papers, 26 questions, shared practice modules and PWA checks OK.');
