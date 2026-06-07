import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const practice = require(path.join(root, 'assets', 'practice-utils.js'));
const expectedCounts = [4, 92, 72, 1, 3, 50, 22, 38, 226, 27, 130];
const answerPaperIds = new Set(['paper-03', 'paper-08', 'paper-09', 'paper-10', 'paper-11']);
const htmlFiles = ['index.html', 'challenge.html', 'offline.html', '404.html'];
const paperFiles = expectedCounts.map((_, index) => `papers/paper-${String(index + 1).padStart(2, '0')}.html`);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function paperData(relativePath) {
  const html = read(relativePath);
  const match = html.match(/<script id="exam-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert(match, `${relativePath} 缺少 exam-data`);
  return JSON.parse(match[1]);
}

function verifyInternalLinks(relativePath) {
  const html = read(relativePath);
  const links = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(?:#|https?:|mailto:|data:|javascript:)/.test(link)) continue;
    const clean = decodeURIComponent(link.split(/[?#]/)[0]);
    if (!clean) continue;
    const target = path.resolve(root, path.dirname(relativePath), clean);
    assert(fs.existsSync(target), `${relativePath} 的内部资源不存在：${link}`);
  }
}

const papers = paperFiles.map(paperData);
assert.deepEqual(papers.map((paper) => paper.question_count), expectedCounts, '各试卷题数不匹配');
assert.equal(papers.reduce((sum, paper) => sum + paper.question_count, 0), 665, '总题数必须为665');
assert.equal(papers.filter((paper) => paper.has_answers).reduce((sum, paper) => sum + paper.question_count, 0), 493, '答案覆盖必须为493题');

papers.forEach((paper, index) => {
  assert.equal(paper.questions.length, expectedCounts[index], `${paper.id} questions数组数量不匹配`);
  assert.equal(Boolean(paper.has_answers), answerPaperIds.has(paper.id), `${paper.id} has_answers不匹配`);
  if (!paper.has_answers) return;

  paper.questions.forEach((question) => {
    assert(question.reference, `${paper.id} 第${question.number}题缺少答案`);
    assert(Array.isArray(question.reference.answer) && question.reference.answer.length > 0, `${paper.id} 第${question.number}题答案为空`);
    assert(question.reference.explanation, `${paper.id} 第${question.number}题解析为空`);
    assert(question.reference.source, `${paper.id} 第${question.number}题教材出处为空`);
    assert(question.reference.basis, `${paper.id} 第${question.number}题依据类型为空`);

    if (['单选题', '多选题', '判断题'].includes(question.type)) {
      const optionLabels = new Set(question.options.map((option) => option.label));
      question.reference.answer.forEach((label) => {
        assert(optionLabels.has(label), `${paper.id} 第${question.number}题答案选项${label}不存在`);
      });
    }
    if (question.type === '填空题') {
      assert.equal(question.reference.answer.length, question.blank_count, `${paper.id} 第${question.number}题填空答案数量不匹配`);
      assert.equal(question.reference.accepted.length, question.blank_count, `${paper.id} 第${question.number}题同义答案数量不匹配`);
    }
  });
});

const paper03 = papers.find((paper) => paper.id === 'paper-03');
assert.equal(paper03.questions[2].reference.explanation, 'Hadoop 的两大核心组成部分是 HDFS 和 MapReduce。');
assert.match(paper03.questions[10].reference.explanation, /全面性、多维性和高效性/);
assert(practice.isCorrect(paper03.questions[20], ['离群值']), '填空同义答案“离群值”应判定正确');
assert(practice.isCorrect(paper03.questions[46], ['Spark MLlib']), '填空同义答案“Spark MLlib”应判定正确');
assert(practice.isCorrect(paper03.questions[2], ['C', 'A']), '多选题应忽略选择顺序');

const paper10 = papers.find((paper) => paper.id === 'paper-10');
assert.equal(paper10.questions.filter((question) => question.type === '主观题').length, 27, '主观题必须为27题');
assert(paper10.questions.every((question) => practice.isCorrect(question, true)), '主观题“会做”应判定通过');
assert.deepEqual(
  papers.filter((paper) => paper.has_answers).map((paper) => paper.question_count),
  [72, 38, 226, 27, 130],
  '五套闯关题库题数不匹配',
);

const paper09 = papers.find((paper) => paper.id === 'paper-09');
assert.match(paper09.questions[0].reference.explanation, /查询分析计算/);
assert.match(paper09.questions[0].reference.explanation, /Hive、Impala、Presto/);
assert.match(paper09.questions[8].reference.explanation, /时间戳/);
assert.equal(paper09.questions[42].reference.answer[0], 'A', '冲突文本不得覆盖第43题答案');
assert.equal(paper09.questions[42].reference.explanation, '正确内容为：任务重试。', '冲突文本不得覆盖第43题解析');
assert.equal(paper09.questions[200].reference.answer[0], 'A', '争议文本不得覆盖第201题答案');

const indexHtml = read('index.html');
assert.equal((indexHtml.match(/class="card-link challenge-link"/g) || []).length, 5, '首页必须静态包含5个闯关入口');

const manifest = JSON.parse(read('manifest.webmanifest'));
assert(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'), 'manifest缺少192x192 PNG图标');
assert(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'), 'manifest缺少512x512 PNG图标');

const challengeJs = read('assets/challenge.js');
assert(!/explanationRules|searchText|const rules\s*=/.test(challengeJs), '闯关解析不得使用关键词猜测规则');
assert(/reference\.explanation/.test(challengeJs), '闯关解析必须使用题目reference.explanation');
const examJs = read('assets/exam.js');
assert(/const raw = question\.reference\?\.explanation/.test(examJs), '快速刷题解析必须使用题目reference.explanation');

for (const relativePath of [...htmlFiles, ...paperFiles]) {
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
  assert(!/\bwindow\.(?:alert|confirm)\s*\(|(^|[^\w.])alert\s*\(/m.test(source), `${relativePath} 仍含原生弹窗`);
}

const serviceWorker = read('sw.js');
for (const relativePath of [...paperFiles, 'index.html', 'challenge.html', 'offline.html']) {
  assert(serviceWorker.includes(`./${relativePath}`), `离线缓存缺少${relativePath}`);
}
for (const iconPath of ['./assets/icons/icon-192.png', './assets/icons/icon-512.png']) {
  assert(serviceWorker.includes(iconPath), `离线缓存缺少${iconPath}`);
}

console.log('Validation passed: 11 papers, 665 questions, 493 answered questions, PWA and challenge checks OK.');
