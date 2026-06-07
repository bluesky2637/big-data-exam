import fs from 'node:fs';
import path from 'node:path';

const [, , sourceArgument, paperArgument = 'papers/paper-09.html', writeFlag] = process.argv;

if (!sourceArgument) {
  console.error('Usage: node scripts/import-detailed-explanations.mjs <text-file> [paper-html] [--write]');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.resolve(sourceArgument);
const paperPath = path.resolve(root, paperArgument);
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r/g, '');
const html = fs.readFileSync(paperPath, 'utf8');
const dataPattern = /<script id="exam-data" type="application\/json">([\s\S]*?)<\/script>/;
const dataMatch = html.match(dataPattern);

if (!dataMatch) throw new Error(`${paperArgument} is missing exam-data`);

const paper = JSON.parse(dataMatch[1]);
const headings = [...source.matchAll(/^(\d+)\.\s+/gm)];
const sections = headings.map((match, index) => ({
  number: Number(match[1]),
  body: source.slice(match.index + match[0].length, headings[index + 1]?.index ?? source.length).trim(),
}));

if (sections.length !== paper.questions.length) {
  throw new Error(`Explanation count ${sections.length} does not match question count ${paper.questions.length}`);
}

function plainText(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/未作答/g, '')
    .replace(/^\d+\./, '')
    .replace(/\s+/g, '')
    .replace(/[“”"'，,。．、：:；;（）()？?—_-]/g, '')
    .toLowerCase();
}

function sourceStem(section) {
  const firstLine = section.body.split('\n')[0];
  return (firstLine.includes('—') ? firstLine.split('—').slice(1).join('—') : firstLine).trim();
}

function explanationText(section, fallback) {
  const lines = section.body.split('\n');
  lines.shift();
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines[0]?.trim().startsWith('正确答案')) lines.shift();
  while (lines.length && !lines[0].trim()) lines.shift();

  const detailed = lines.join('\n')
    .replace(/\*\*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return detailed || fallback;
}

function providedChoiceLabels(section) {
  const answerLine = section.body.split('\n').find((line) => line.trim().startsWith('正确答案'));
  if (!answerLine) return [];
  const answerText = answerLine.replace(/^.*?[:：]\s*/, '');
  const labelMatch = answerText.match(/^([A-D](?:\s*[,，、]\s*[A-D])*)\b/);
  return labelMatch ? [...labelMatch[1].matchAll(/[A-D]/g)].map((match) => match[0]) : [];
}

const mismatches = [];
const answerConflicts = [];
let changed = 0;

sections.forEach((section, index) => {
  const question = paper.questions[index];
  if (section.number !== question.number) {
    throw new Error(`Question order mismatch at ${index + 1}: source=${section.number}, paper=${question.number}`);
  }

  const incomingStem = plainText(sourceStem(section));
  const existingStem = plainText(question.stem_html);
  if (!(incomingStem === existingStem || incomingStem.includes(existingStem) || existingStem.includes(incomingStem))) {
    mismatches.push({
      number: question.number,
      source: sourceStem(section),
      paper: question.stem_html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
    });
  }

  const providedLabels = providedChoiceLabels(section);
  const existingLabels = question.reference.answer || [];
  const isChoice = ['单选题', '多选题', '判断题'].includes(question.type);
  const hasConflict = isChoice
    && providedLabels.length > 0
    && JSON.stringify([...providedLabels].sort()) !== JSON.stringify([...existingLabels].sort());
  if (hasConflict) {
    answerConflicts.push({
      number: question.number,
      provided: providedLabels,
      existing: existingLabels,
    });
    return;
  }

  const explanation = explanationText(section, question.reference.explanation);
  if (!explanation) throw new Error(`Question ${question.number} has an empty explanation`);
  if (question.reference.explanation !== explanation) changed += 1;
  question.reference.explanation = explanation;
});

const summary = {
  paper: paper.id,
  questions: paper.questions.length,
  changed,
  stemMismatches: mismatches.length,
  mismatchNumbers: mismatches.map((item) => item.number),
  answerConflicts,
};

if (writeFlag === '--write') {
  const updated = html.replace(dataPattern, `<script id="exam-data" type="application/json">${JSON.stringify(paper)}</script>`);
  fs.writeFileSync(paperPath, updated, 'utf8');
}

console.log(JSON.stringify(summary, null, 2));
