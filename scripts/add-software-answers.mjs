import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const softwarePaperIds = ['paper-04', 'paper-05', 'paper-07'];

const reference = (answer, explanation, source, accepted = []) => ({
  answer,
  accepted,
  explanation,
  source,
  basis: '教材与题图核对',
});

const references = {
  'paper-04': {
    1: reference(
      [
        '-1：B，低于合法下界，拒绝录入并提示错误。',
        '0：A，合法下界，成功保存。',
        '1：A，紧邻下界的合法值，成功保存。',
        '50：A，范围内典型值，成功保存。',
        '99：A，紧邻上界的合法值，成功保存。',
        '100：A，合法上界，成功保存。',
        '101：B，高于合法上界，拒绝录入并提示错误。',
      ],
      '单变量完美边界值分析应覆盖 min-、min、min+、典型值、max-、max、max+，因此共设计7个整数测试值。',
      '软件测试：边界值分析法',
    ),
  },
  'paper-05': {
    1: reference(
      [
        '外部实体：E1=平台管理员，E2=农户，E3=租户，E4=第三方软件。',
        '数据存储：D1=人员（人员信息），D2=地块（地块信息），D3=农事过程，D4=农事活动。',
        '判断方法：沿图中的数据流名称回到说明文字，实体名称必须使用说明中的角色名，数据存储使用被长期保存的数据名称。',
      ],
      '上下文图和0层图必须保持外部实体及数据流平衡。图中“租户信息”来自平台管理员，“农事提醒”发往农户，“农事信息响应”发往第三方软件，据此可确定实体编号。',
      '软件工程：结构化分析与数据流图',
    ),
    2: reference(
      [
        '外部实体：E1=教师，E2=学生。',
        '数据存储：D1=试题，D2=学生信息，D3=考试信息，D4=解答结果。',
        '对应关系：教师输入试题、考试说明和学生信息；学生提交解答并查看个人成绩报告；解答结果同时用于生成个人成绩报告和课程成绩单。',
      ],
      '实体可由顶层图中的输入输出判断；数据存储可由0层图的写入数据流判断。D4接收“解答结果”，并向成绩报告与成绩单处理提供数据。',
      '软件工程：结构化分析与数据流图',
    ),
    3: reference(
      [
        '外部实体：E1=监控设备，E2=护理人员，E3=医生。',
        '数据存储：D1=生命特征范围文件，D2=日志文件，D3=病历文件，D4=治疗意见文件。',
        '对应关系：监控设备提供生命特征；医生维护正常范围、生成病历和治疗意见；医生与护理人员接收警告并查询报告或治疗意见。',
      ],
      '0层图中D1向“检查生命特征”提供正常范围，D2保存格式化后的生命特征，D3供查询病历，D4供查询治疗意见，因此可确定四个数据存储。',
      '软件工程：结构化分析与数据流图',
    ),
  },
  'paper-07': {
    1: reference(['A'], '封装、继承和多态有助于复用已有数据结构与行为，因此题述正确。', '面向对象方法：基本特征'),
    2: reference(['A'], '类是具有相同属性结构和相同操作的一组对象的抽象定义。', '面向对象方法：对象与类'),
    3: reference(['B'], '常见OOD模型部件包括问题域、人机交互、任务管理和数据管理，通信部件不属于该经典划分。', '面向对象设计：模型主要部件'),
    4: reference(['C'], '对象模型描述对象、类及其关系，是动态模型和功能模型的基础。', '面向对象分析：三种模型'),
    5: reference(['D'], '对象类定义该类对象共同具有的属性和方法；给定选项中应选“方法”。', '面向对象方法：类与方法'),
    6: reference(
      ['需求模型', '分析模型', '设计模型', '实现模型', '测试模型'],
      'OOSE用需求、分析、设计、实现和测试五类模型覆盖从需求获取到验证的开发过程。',
      'OOSE方法：五类模型',
      [
        ['需求模型', '用例模型'],
        ['分析模型'],
        ['设计模型'],
        ['实现模型'],
        ['测试模型'],
      ],
    ),
    7: reference(['B'], '面向对象设计需要考虑体系结构、技术环境和实现约束，因此“不关注技术和实现细节”错误。', '面向对象分析与设计的区别'),
    8: reference(['C'], '对象设计细化分析对象、补充实现所需对象，并详细说明类和子系统接口。', '面向对象设计：对象设计'),
    9: reference(['D'], '封装把对象状态和操作绑定在一起，并隐藏内部实现，从而实现信息隐蔽。', '面向对象方法：封装'),
    10: reference(['A'], '用例图描述参与者、用例以及它们之间的关系。', 'UML：用例图'),
    11: reference(['C'], '顺序图按时间顺序展示对象之间消息的发送过程。', 'UML：顺序图'),
    12: reference(['A'], 'OOD是在OOA模型基础上的细化和实现方案设计，不是与OOA相对立的另一种思维方式。', '面向对象分析与设计的衔接'),
    13: reference(['B'], '学生属于班级表示两个类实例之间的结构性联系，属于关联关系。', 'UML：类之间的关系'),
    14: reference(
      ['对象标识', '对象状态', '对象行为'],
      '对象由唯一标识区分，通过状态保存属性值，并通过行为或服务响应消息。',
      '面向对象方法：对象三要素',
      [
        ['对象标识', '标识'],
        ['对象状态', '状态', '属性'],
        ['对象行为', '行为', '服务'],
      ],
    ),
    15: reference(['D'], 'OOA面向问题域抽取需求并建立分析模型，本质上属于需求建模。', '面向对象分析'),
    16: reference(
      ['模块化', '抽象', '信息隐藏', '低耦合', '高内聚'],
      '这些准则用于控制复杂度、隔离变化并提高软件的可理解性、可维护性和复用性。',
      '面向对象设计：设计准则',
      [
        ['模块化'],
        ['抽象'],
        ['信息隐藏', '信息隐蔽'],
        ['低耦合', '弱耦合'],
        ['高内聚', '强内聚'],
      ],
    ),
    17: reference(['A'], '经典OOA方法建立对象模型、动态模型和功能模型。', '面向对象分析：三种模型'),
    18: reference(['B'], '包含关系表示基础用例必然复用被包含用例的行为。', 'UML用例图：include关系'),
    19: reference(['A'], '对象模型是三种分析模型的核心，动态模型和功能模型围绕对象协作展开。', '面向对象分析：对象模型'),
    20: reference(
      ['系统设计', '对象设计'],
      'OOD通常分为系统设计和对象设计：前者确定整体体系结构与子系统，后者细化类、接口和算法。',
      '面向对象设计：阶段划分',
      [
        ['系统设计', '总体设计'],
        ['对象设计', '详细设计'],
      ],
    ),
    21: reference(['A'], '人机交互设计既受系统功能约束，也受用户认知、习惯和主观体验影响。', '面向对象设计：人机交互'),
    22: reference(['C'], '抽取和整理用户需求、识别问题域对象并建立精确模型的过程是面向对象分析。', '面向对象分析'),
  },
};

function safeJson(data) {
  return JSON.stringify(data).replaceAll('<', '\\u003c');
}

function practicePanel() {
  return `
      <section class="practice-panel" id="practice-panel" hidden aria-label="快速刷题统计">
        <div class="practice-stat"><strong id="practice-completed">0</strong><span>已完成</span></div>
        <div class="practice-stat practice-correct"><strong id="practice-correct">0</strong><span>首次答对</span></div>
        <div class="practice-stat practice-wrong"><strong id="practice-wrong">0</strong><span>首次答错</span></div>
        <div class="practice-stat"><strong id="practice-rate">--</strong><span>正确率</span></div>
        <button class="button button-quiet practice-wrong-button" id="wrong-only-button" type="button">
          只刷错题 <span id="wrong-count">0</span>
        </button>
      </section>
        `;
}

function updatePaperPage(paper) {
  const file = path.join(root, 'papers', `${paper.id}.html`);
  let html = fs.readFileSync(file, 'utf8');

  html = html.replace(
    /<script id="exam-data" type="application\/json">[\s\S]*?<\/script>/,
    `<script id="exam-data" type="application/json">${safeJson(paper)}</script>`,
  );

  if (!html.includes('class="mode-switch"')) {
    html = html.replace(
      /(\s*<p>[^<]+<\/p>)\s*(<\/div>\s*<dl class="paper-facts">)/,
      `$1
        <div class="mode-switch" role="group" aria-label="作答模式">
          <button class="mode-button active" type="button" data-mode="exam">模拟考试</button>
          <button class="mode-button" type="button" data-mode="practice">快速刷题</button>
        </div>
        $2`,
    );
  }

  html = html.replace(
    /<div class="paper-note">\s*<strong>模拟作答模式<\/strong>\s*<span>本页面暂无参考答案，也不会自动评分。专业归属根据试题内容推断，不代表学校官方认定。<\/span>\s*<\/div>/,
    `<div class="paper-note">
          <strong id="mode-note-title">模拟考试模式</strong>
          <span id="mode-note-copy">模拟考试不显示答案、不自动评分；切换到快速刷题可即时判定并查看参考解析。</span>
        </div>`,
  );

  if (!html.includes('id="practice-panel"')) {
    html = html.replace(
      /(\s*<form id="exam-form")/,
      `${practicePanel()}

$1`,
    );
  }

  if (!html.includes('id="reset-practice-button"')) {
    html = html.replace(
      /(<button class="button button-quiet" id="print-button"[^>]*>打印试卷<\/button>)/,
      `$1
          <button class="button button-quiet practice-action" id="reset-practice-button" type="button" hidden>重置本轮</button>
          <button class="button button-danger practice-action" id="clear-wrong-button" type="button" hidden>清空错题记录</button>`,
    );
  }

  fs.writeFileSync(file, html.replace(/[ \t]+$/gm, ''));
}

const papersFile = path.join(root, 'data', 'papers.json');
const papers = JSON.parse(fs.readFileSync(papersFile, 'utf8'));

for (const paper of papers) {
  if (!softwarePaperIds.includes(paper.id)) continue;
  paper.has_answers = true;
  for (const question of paper.questions) {
    const value = references[paper.id]?.[question.number];
    if (!value) throw new Error(`${paper.id} 第${question.number}题缺少软件工程答案`);
    question.reference = value;
  }
  updatePaperPage(paper);
}

fs.writeFileSync(papersFile, `${JSON.stringify(papers, null, 2)}\n`);

const auditFile = path.join(root, 'data', 'audit.json');
const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
for (const paper of audit.papers) {
  if (softwarePaperIds.includes(paper.id)) paper.answer_count = paper.question_count;
}
fs.writeFileSync(auditFile, `${JSON.stringify(audit, null, 2)}\n`);

const indexFile = path.join(root, 'index.html');
let indexHtml = fs.readFileSync(indexFile, 'utf8');
for (const id of softwarePaperIds) {
  const paper = papers.find((item) => item.id === id);
  const card = [...indexHtml.matchAll(/<article class="paper-card"[\s\S]*?<\/article>/g)]
    .map((item) => item[0])
    .find((item) => item.includes(`href="papers/${id}.html"`));
  if (!card) throw new Error(`首页缺少 ${id} 卡片`);
  let updatedCard = card;

  if (!updatedCard.includes('class="answer-badge"')) {
    updatedCard = updatedCard.replace(
      /(<div class="tag-row">[\s\S]*?)(<\/div>)/,
      '$1<span class="answer-badge">含快速刷题</span>$2',
    );
  }

  if (!updatedCard.includes('challenge-link')) {
    const linkPattern = new RegExp(
      `<a class="card-link" href="papers/${id}\\.html"([\\s\\S]*?)</a>`,
    );
    const link = updatedCard.match(linkPattern)?.[0];
    if (!link) throw new Error(`${id} 卡片缺少开始作答链接`);
    const challengeUrl = `challenge.html?paper=papers%2F${id}.html`;
    updatedCard = updatedCard.replace(
      link,
      `<div class="card-link-group">
          ${link}
          <a class="card-link challenge-link" href="${challengeUrl}" aria-label="20题闯关：${paper.title}">20题闯关 <span>↗</span></a>
        </div>`,
    );
  }

  indexHtml = indexHtml.replace(card, updatedCard);
}

indexHtml = indexHtml.replace(
  '五套大数据试卷已依据林子雨《大数据导论》第2版加入快速刷题、即时判定和教材出处；模拟考试仍不显示分数。',
  '五套大数据试卷和三套软件工程试卷已加入快速刷题、即时判定和参考出处；模拟考试仍不显示分数。',
);
fs.writeFileSync(indexFile, indexHtml);

console.log('Added reference answers to paper-04, paper-05 and paper-07.');
