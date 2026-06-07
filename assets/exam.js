(() => {
  const paper = JSON.parse(document.querySelector("#exam-data").textContent);
  const hasAnswers = Boolean(paper.has_answers);
  const examStorageKey = `offline-exam:${paper.id}:v1`;
  const practiceStorageKey = `offline-practice:${paper.id}:v2`;
  const modeStorageKey = `offline-mode:${paper.id}:v1`;
  const questionsRoot = document.querySelector("#questions");
  const grid = document.querySelector("#question-grid");
  const form = document.querySelector("#exam-form");
  const timer = document.querySelector("#timer");
  const storageStatus = document.querySelector("#storage-status");
  const sidebar = document.querySelector("#question-sidebar");

  let mode = "exam";
  let examElapsed = 0;
  let submitted = false;
  let canStore = true;
  let tickHandle = null;
  let wrongOnly = false;
  let examAnswers = {};
  let practice = emptyPracticeState();

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $all(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  }

  function emptyPracticeState() {
    return {
      version: 2,
      paperId: paper.id,
      savedAt: null,
      elapsed: 0,
      answers: {},
      firstResults: {},
      attempts: {},
      latestResults: {},
      revealed: {},
      history: {},
    };
  }

  function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  }

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = value || "";
    return node.innerHTML;
  }

  function textFromHtml(value) {
    const node = document.createElement("div");
    node.innerHTML = value || "";
    return node.textContent.replace(/\s+/g, " ").trim();
  }

  function renderControl(question) {
    const name = `q-${question.number}`;
    if (question.type === "单选题" || question.type === "判断题") {
      return `<div class="option-list">${question.options.map((option) => `
        <label class="option-row" data-option="${option.label}">
          <input type="radio" name="${name}" value="${option.label}">
          <span class="option-letter">${option.label}</span>
          <span class="option-text">${option.html || escapeHtml(option.text)}</span>
        </label>`).join("")}</div>`;
    }
    if (question.type === "多选题") {
      return `<div class="option-list">${question.options.map((option) => `
        <label class="option-row" data-option="${option.label}">
          <input type="checkbox" name="${name}" value="${option.label}">
          <span class="option-letter">${option.label}</span>
          <span class="option-text">${option.html || escapeHtml(option.text)}</span>
        </label>`).join("")}</div>`;
    }
    if (question.type === "填空题") {
      const count = Math.max(question.blank_count, 1);
      return `<div class="blank-list">${Array.from({ length: count }, (_, index) => `
        <label class="blank-row">
          <span>第 ${index + 1} 空</span>
          <input type="text" name="${name}-${index + 1}" data-question="${question.number}" placeholder="请输入答案">
        </label>`).join("")}</div>`;
    }
    return `<label class="essay-box">
      <span>作答区</span>
      <textarea name="${name}" rows="${question.type === "案例分析" ? 12 : 7}" placeholder="在此输入你的回答"></textarea>
    </label>`;
  }

  function answerLabel(question) {
    const values = question.reference?.answer || [];
    if (["单选题", "多选题", "判断题"].includes(question.type)) return values.join("、");
    if (question.type === "填空题") {
      return values.map((value, index) => `第 ${index + 1} 空：${value}`).join("；");
    }
    return values.join("；");
  }

  function answerTexts(question) {
    const labels = new Set(question.reference?.answer || []);
    return (question.options || [])
      .filter((option) => labels.has(option.label))
      .map((option) => `${option.label}. ${textFromHtml(option.html || option.text)}`)
      .join("；");
  }

  function stemText(question) {
    return textFromHtml(question.stem_html || "");
  }

  function haystack(question) {
    return `${stemText(question)} ${(question.options || []).map((option) => option.text).join(" ")} ${answerTexts(question)} ${question.reference?.source || ""}`;
  }

  function detectTopic(question) {
    const text = haystack(question);
    const rules = [
      [/MongoDB|Redis|Neo4j|Cassandra|NoSQL|文档数据库|键值数据库|图数据库|列族数据库/, "NoSQL 数据库类型和特点"],
      [/关系数据库|SQL Server|DB2|Oracle|MySQL|ACID|主键|外键|关系模型|在线交易/, "关系数据库的基本概念"],
      [/数据仓库|OLAP|面向主题|历史变化|管理决策/, "数据仓库的核心特征"],
      [/数据湖|湖仓一体|对象存储|原始数据|元数据/, "数据湖与湖仓一体"],
      [/HDFS|NameNode|DataNode|SecondaryNameNode|数据块|小文件|分布式文件系统|GFS/, "HDFS 分布式文件系统"],
      [/HBase|行键|列族|列限定符|时间戳|单元格/, "HBase 数据模型"],
      [/MapReduce|Shuffle|JobTracker|TaskTracker|Map 函数|Reduce|批处理/, "MapReduce 计算模型"],
      [/Spark|RDD|Spark SQL|Spark Streaming|GraphX|MLlib|Structured Streaming/, "Spark 生态与内存计算"],
      [/Flink|Storm|流计算|毫秒级|事件时间|摄入时间|处理时间|行级实时/, "流计算框架"],
      [/云计算|云数据库|IaaS|PaaS|SaaS|按需付费|多租|多副本/, "云计算与云数据库"],
      [/可视化|折线图|饼图|散点图|柱状图|漏斗图|桑基图|热力图|树图|词云图|雷达图|玫瑰图|日历图|Tableau|ECharts|Gephi|D3/, "数据可视化图表选择"],
      [/机器学习|监督学习|无监督学习|分类|聚类|回归|决策树|朴素贝叶斯|支持向量机|K-Means|DBSCAN|逻辑回归|主成分分析/, "机器学习与数据挖掘算法"],
      [/协同过滤|UserCF|ItemCF|ALS|基于用户|基于物品|推荐/, "推荐算法与协同过滤"],
      [/关联规则|Apriori|FP-Growth|支持度|置信度|可信度|提升度|购物篮/, "关联规则挖掘"],
      [/数据清洗|数据集成|数据转换|数据规约|标准化|离散化|采样|预处理/, "数据预处理流程"],
      [/大数据|Volume|Velocity|Variety|Value|Veracity|计算模式/, "大数据基本概念"],
    ];
    const matched = rules.find(([pattern]) => pattern.test(text));
    return matched ? matched[1] : "本题对应的基础概念";
  }

  function memoryTip(question) {
    const text = haystack(question);
    const tips = [
      [/MongoDB/, "MongoDB = 文档型 NoSQL，不是关系数据库。"],
      [/Redis/, "Redis = 键值数据库，常用于缓存和会话。"],
      [/Neo4j/, "Neo4j = 图数据库，适合社交关系、路径关系。"],
      [/HDFS.*128MB|128MB|数据块/, "HDFS 默认块大小常考 128MB，面向大文件。"],
      [/NameNode/, "NameNode 管元数据，DataNode 存数据块。"],
      [/SecondaryNameNode/, "SecondaryNameNode 不是热备，主要合并编辑日志。"],
      [/HBase.*时间戳|时间戳/, "HBase 多版本靠时间戳区分。"],
      [/HBase.*行键|行键/, "HBase 一行靠 RowKey 唯一定位。"],
      [/HBase.*列族|列族/, "HBase 先分列族，再分列限定符。"],
      [/Shuffle/, "Shuffle 是 Map 到 Reduce 的中转站，负责分组和排序。"],
      [/MapReduce.*磁盘|延迟|迭代/, "MapReduce 中间结果落磁盘，所以慢、不适合迭代。"],
      [/RDD/, "Spark 核心抽象是 RDD，特点是只读、可分区、可容错。"],
      [/Spark Core/, "Spark Core 是 Spark 的核心底座。"],
      [/GraphX/, "GraphX 负责 Spark 图计算。"],
      [/Flink/, "Flink 偏真正流处理，低延迟是常考关键词。"],
      [/数据仓库.*主题|面向主题/, "数据仓库四特征：面向主题、集成、稳定、历史变化。"],
      [/数据湖/, "数据湖强调先存原始数据，结构化/半结构化/非结构化都能放。"],
      [/湖仓一体/, "湖仓一体重点是打通湖和仓的数据、元数据。"],
      [/IaaS|PaaS|SaaS/, "云计算三模式：IaaS、PaaS、SaaS。"],
      [/折线图/, "看时间趋势选折线图。"],
      [/饼图/, "看部分与整体选饼图。"],
      [/散点图/, "看两个变量相关性选散点图。"],
      [/柱状图/, "看类别大小比较选柱状图。"],
      [/漏斗图/, "看转化流程选漏斗图。"],
      [/桑基图/, "看流向、能量或数据流动选桑基图。"],
      [/热力图/, "看密度、地理分布或热点选热力图。"],
      [/词云图/, "看关键词频率选词云图。"],
      [/聚类|K-Means|DBSCAN/, "聚类是无监督学习，典型场景是用户分群。"],
      [/回归|线性回归|房价|销售额/, "回归预测连续数值，比如房价、销售额。"],
      [/分类|决策树|朴素贝叶斯|支持向量机/, "分类预测类别标签，比如垃圾邮件、是否流失。"],
      [/Apriori|FP-Growth/, "Apriori/FP-Growth 都是关联规则，FP-Growth 不生成候选集。"],
      [/协同过滤|ItemCF|UserCF/, "人以群分是 UserCF，物以类聚是 ItemCF。"],
      [/数据清洗/, "预处理第一步常考数据清洗。"],
      [/数据标准化/, "标准化属于数据转换。"],
      [/数据离散化/, "离散化常归到数据规约/转换相关考点。"],
      [/Volume/, "Volume 表示数据量大。"],
      [/Velocity/, "Velocity 表示产生和处理速度快。"],
      [/Variety/, "Variety 表示数据类型多样。"],
      [/Value/, "Value 表示价值密度低但总价值高。"],
    ];
    const matched = tips.find(([pattern]) => pattern.test(text));
    if (matched) return matched[1];
    if (question.type === "判断题") return "判断题先抓关键词，和教材核心表述一致就是对，不一致就是错。";
    return "先记住题干中的核心名词，再把它和正确答案绑定起来。";
  }

  function learningExplanation(question) {
    const topic = detectTopic(question);
    const answer = escapeHtml(answerLabel(question));
    const selected = answerTexts(question);
    const selectedText = selected ? `正确答案对应的是：${escapeHtml(selected)}。` : `正确答案是：${answer}。`;
    const source = question.reference?.source ? `这类题一般来自“${escapeHtml(question.reference.source)}”相关知识点。` : "";
    const original = question.reference?.explanation || "";
    const usefulOriginal = original && !/^正确内容为[:：]|^本题应填|题述/.test(original)
      ? `补充理解：${escapeHtml(original)}`
      : "";

    if (["单选题", "多选题", "判断题"].includes(question.type)) {
      return `本题考查${topic}。${selectedText}${source}${usefulOriginal ? usefulOriginal : ""}记忆点：${escapeHtml(memoryTip(question))}`;
    }
    if (question.type === "填空题") {
      return `本题考查${topic}。填空题重点是把关键词写准确，本题应填：${answer}。${source}记忆点：${escapeHtml(memoryTip(question))}`;
    }
    return usefulOriginal || `本题考查${topic}。作答时先写核心概念，再结合题干补充原因和应用场景。`;
  }

  function renderReference(question) {
    if (!question.reference) return "";
    const isSubjective = !["单选题", "多选题", "判断题", "填空题"].includes(question.type);
    const points = isSubjective
      ? `<ol>${question.reference.answer.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ol>`
      : `<p class="reference-answer"><strong>参考答案</strong><span>${escapeHtml(answerLabel(question))}</span></p>`;
    const confirmButton = ["多选题", "填空题"].includes(question.type)
      ? `<button class="button button-primary confirm-answer" type="button" data-confirm="${question.number}">确认答案</button>`
      : "";
    const selfGrade = isSubjective
      ? `<div class="self-grade" data-self-grade="${question.number}" hidden>
          <span>对照后自评：</span>
          <button class="button button-primary self-grade-button" type="button" data-grade="correct">会做</button>
          <button class="button button-danger self-grade-button" type="button" data-grade="wrong">不会</button>
        </div>`
      : "";
    return `
      <div class="practice-question-actions">
        ${confirmButton}
        <button class="button button-quiet reveal-answer" type="button" data-reveal="${question.number}">查看参考答案</button>
      </div>
      <section class="feedback-panel" data-feedback="${question.number}" hidden aria-live="polite">
        <div class="feedback-verdict" data-verdict="${question.number}">参考答案</div>
        ${points}
        <p class="reference-explanation"><strong>解析：</strong>${learningExplanation(question)}</p>
        <footer>
          <span>${escapeHtml(question.reference.source || "速记解析")}</span>
          <span class="basis-badge">考试记忆版</span>
        </footer>
      </section>
      ${selfGrade}`;
  }

  function renderQuestions() {
    questionsRoot.innerHTML = paper.questions.map((question) => `
      <article class="question-card" id="question-${question.number}" data-question="${question.number}" data-type="${question.type}">
        <header class="question-header">
          <div class="question-number">${String(question.number).padStart(2, "0")}</div>
          <div>
            <span class="question-type">${question.type}</span>
            <span class="question-score">${question.score} 分</span>
          </div>
          <button class="mark-button" type="button" aria-label="标记第 ${question.number} 题" title="标记稍后检查">◇</button>
        </header>
        <div class="question-stem">${question.stem_html}</div>
        ${question.missing_images ? `<p class="question-source-warning">这道题有 ${question.missing_images} 处图片在原始 HTML 中已经缺失。</p>` : ""}
        <div class="answer-area">${renderControl(question)}</div>
        ${renderReference(question)}
      </article>`).join("");

    if (hasAnswers) {
      questionsRoot.insertAdjacentHTML("beforeend", `
        <section class="practice-empty" id="practice-empty" hidden>
          <span class="eyebrow">错题已清空</span>
          <h2>这一轮没有待复习的错题</h2>
          <p>返回整套刷题继续练习，新的错题会自动加入错题记录。</p>
          <button class="button button-primary" id="return-all-questions" type="button">返回整套刷题</button>
        </section>
      `);
    }

    grid.innerHTML = paper.questions.map((question) => `
      <a href="#question-${question.number}" data-nav="${question.number}" title="第 ${question.number} 题">${question.number}</a>
    `).join("");
  }

  function collectAnswers() {
    const answers = {};
    paper.questions.forEach((question) => {
      const name = `q-${question.number}`;
      if (question.type === "多选题") {
        answers[question.number] = $all(`input[name="${name}"]:checked`, form).map((input) => input.value);
      } else if (question.type === "填空题") {
        answers[question.number] = $all(`input[data-question="${question.number}"]`, form).map((input) => input.value);
      } else if (question.type === "单选题" || question.type === "判断题") {
        answers[question.number] = $(`input[name="${name}"]:checked`, form)?.value || "";
      } else {
        answers[question.number] = $(`[name="${name}"]`, form)?.value || "";
      }
    });
    return answers;
  }

  function isAnswered(question, value) {
    if (question.type === "填空题") {
      return Array.isArray(value) && value.length >= question.blank_count && value.every((item) => String(item).trim());
    }
    if (Array.isArray(value)) return value.some((item) => String(item).trim());
    return Boolean(String(value || "").trim());
  }

  function clearForm() {
    form.reset();
    $all(".question-card", form).forEach((card) => card.classList.remove("answered", "practice-correct-state", "practice-wrong-state"));
    $all(".option-row", form).forEach((row) => row.classList.remove("correct-option", "wrong-option"));
    $all(".feedback-panel", form).forEach((panel) => { panel.hidden = true; });
    $all(".self-grade", form).forEach((panel) => { panel.hidden = true; });
  }

  function applyAnswers(answers = {}) {
    clearForm();
    paper.questions.forEach((question) => {
      const value = answers[question.number];
      const name = `q-${question.number}`;
      if (question.type === "多选题") {
        const selected = Array.isArray(value) ? value : [];
        $all(`input[name="${name}"]`, form).forEach((input) => { input.checked = selected.includes(input.value); });
      } else if (question.type === "填空题") {
        const values = Array.isArray(value) ? value : [];
        $all(`input[data-question="${question.number}"]`, form).forEach((input, index) => { input.value = values[index] || ""; });
      } else if (question.type === "单选题" || question.type === "判断题") {
        $all(`input[name="${name}"]`, form).forEach((input) => { input.checked = input.value === value; });
      } else {
        const input = $(`[name="${name}"]`, form);
        if (input) input.value = value || "";
      }
    });
  }

  function examProgress() {
    if (mode === "exam") examAnswers = collectAnswers();
    const answered = paper.questions.filter((question) => isAnswered(question, examAnswers[question.number])).length;
    return { answers: examAnswers, answered, unanswered: paper.question_count - answered };
  }

  function hasFirstResult(number) {
    return Object.prototype.hasOwnProperty.call(practice.firstResults, number);
  }

  function activeWrongCount() {
    return paper.questions.filter((question) => {
      const record = practice.history[question.number];
      return record?.wrong && !record?.mastered;
    }).length;
  }

  function practiceQuestionNumbers() {
    if (!wrongOnly) return paper.questions.map((question) => question.number);
    return paper.questions
      .map((question) => question.number)
      .filter((number) => {
        const record = practice.history[number];
        return record?.wrong && !record?.mastered;
      });
  }

  function practiceProgress() {
    const completed = Object.keys(practice.firstResults).length;
    const correct = Object.values(practice.firstResults).filter(Boolean).length;
    const wrong = completed - correct;
    return {
      completed,
      correct,
      wrong,
      rate: completed ? Math.round((correct / completed) * 100) : null,
    };
  }

  function updateWrongButton() {
    const button = $("#wrong-only-button");
    if (!button) return;
    const count = activeWrongCount();
    button.disabled = !wrongOnly && count === 0;
    button.classList.toggle("active", wrongOnly);
    button.innerHTML = wrongOnly
      ? `返回整套刷题 <span>${count}</span>`
      : `错题模式：只刷错题 <span id="wrong-count">${count}</span>`;
  }

  function updateSidebar() {
    if (mode === "exam") {
      const progress = examProgress();
      const percent = Math.round((progress.answered / paper.question_count) * 100);
      $("#answered-count").textContent = progress.answered;
      $("#progress-percent").textContent = `${percent}%`;
      $("#progress-ring").style.setProperty("--progress", percent);
      paper.questions.forEach((question) => {
        const done = isAnswered(question, progress.answers[question.number]);
        grid.querySelector(`[data-nav="${question.number}"]`)?.classList.toggle("answered", done);
        $(`#question-${question.number}`)?.classList.toggle("answered", done);
      });
      return progress;
    }

    const stats = practiceProgress();
    const numbers = practiceQuestionNumbers();
    const percent = Math.round((stats.completed / paper.question_count) * 100);
    $("#answered-count").textContent = stats.completed;
    $("#progress-percent").textContent = `${percent}%`;
    $("#progress-ring").style.setProperty("--progress", percent);
    $("#practice-completed").textContent = stats.completed;
    $("#practice-correct").textContent = stats.correct;
    $("#practice-wrong").textContent = stats.wrong;
    $("#practice-rate").textContent = stats.rate === null ? "--" : `${stats.rate}%`;
    updateWrongButton();

    paper.questions.forEach((question) => {
      const link = grid.querySelector(`[data-nav="${question.number}"]`);
      const completed = hasFirstResult(question.number);
      link?.classList.toggle("answered", completed);
      link?.classList.toggle("practice-correct", practice.firstResults[question.number] === true);
      link?.classList.toggle("practice-wrong", practice.firstResults[question.number] === false);
      link.hidden = wrongOnly && !numbers.includes(question.number);
    });
    return stats;
  }

  function examSnapshot() {
    const progress = examProgress();
    return {
      version: 1,
      paperId: paper.id,
      paperTitle: paper.title,
      savedAt: new Date().toISOString(),
      elapsed: examElapsed,
      submitted,
      answers: progress.answers,
    };
  }

  function practiceSnapshot() {
    practice.answers = mode === "practice" ? collectAnswers() : practice.answers;
    practice.savedAt = new Date().toISOString();
    return practice;
  }

  function writeStorage(key, value) {
    if (!canStore) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      canStore = false;
      storageStatus.textContent = "浏览器禁止本地存储，请使用“导出记录”保存。";
    }
  }

  function saveExam() {
    writeStorage(examStorageKey, examSnapshot());
    if (canStore) storageStatus.textContent = `模拟考试已保存 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
  }

  function savePractice() {
    writeStorage(practiceStorageKey, practiceSnapshot());
    if (canStore) storageStatus.textContent = `刷题记录已保存 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
  }

  function normalizePracticeState(saved) {
    const fallback = emptyPracticeState();
    if (!saved || saved.paperId !== paper.id) return fallback;
    return {
      ...fallback,
      ...saved,
      version: 2,
      answers: saved.answers || {},
      firstResults: saved.firstResults || {},
      attempts: saved.attempts || {},
      latestResults: saved.latestResults || {},
      revealed: saved.revealed || {},
      history: saved.history || {},
    };
  }

  function loadRecords() {
    try {
      const savedExam = JSON.parse(localStorage.getItem(examStorageKey) || "null");
      if (savedExam?.paperId === paper.id) {
        examElapsed = Number(savedExam.elapsed) || 0;
        submitted = Boolean(savedExam.submitted);
        examAnswers = savedExam.answers || {};
      }
      if (hasAnswers) {
        const savedPractice = JSON.parse(localStorage.getItem(practiceStorageKey) || localStorage.getItem(`offline-practice:${paper.id}:v1`) || "null");
        practice = normalizePracticeState(savedPractice);
        const savedMode = localStorage.getItem(modeStorageKey);
        mode = savedMode === "practice" ? "practice" : "exam";
      }
      storageStatus.textContent = savedExam || practice.savedAt ? "已恢复本机保存的学习记录。" : "本地存储可用，开始作答后自动保存。";
    } catch (error) {
      canStore = false;
      storageStatus.textContent = "无法读取本地记录，可使用导入/导出功能。";
    }
  }

  function startTimer() {
    if (tickHandle) return;
    tickHandle = window.setInterval(() => {
      if (mode === "exam") {
        if (submitted) return;
        examElapsed += 1;
        timer.textContent = formatTime(examElapsed);
        if (examElapsed % 10 === 0) saveExam();
      } else {
        practice.elapsed += 1;
        timer.textContent = formatTime(practice.elapsed);
        if (practice.elapsed % 10 === 0) savePractice();
      }
    }, 1000);
  }

  function lockForCurrentMode() {
    const lock = mode === "exam" && submitted;
    form.querySelectorAll("input, textarea").forEach((control) => { control.disabled = lock; });
    document.body.classList.toggle("is-submitted", lock);
    $("#submit-button").disabled = lock;
  }

  function showSummary() {
    const progress = examProgress();
    $("#summary-answered").textContent = progress.answered;
    $("#summary-unanswered").textContent = progress.unanswered;
    $("#summary-time").textContent = formatTime(examElapsed);
    $("#summary-modal").hidden = false;
  }

  function referenceCorrectLabels(question) {
    return new Set(question.reference?.answer || []);
  }

  function normalizeAnswer(value) {
    return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
  }

  function isPracticeCorrect(question, value) {
    const reference = question.reference;
    if (!reference) return false;
    if (question.type === "单选题" || question.type === "判断题") return value === reference.answer[0];
    if (question.type === "多选题") {
      const selected = new Set(Array.isArray(value) ? value : []);
      const expected = new Set(reference.answer);
      return selected.size === expected.size && [...selected].every((item) => expected.has(item));
    }
    if (question.type === "填空题") {
      if (!Array.isArray(value) || value.length !== question.blank_count) return false;
      return value.every((entry, index) => {
        const accepted = [reference.answer[index], ...(reference.accepted[index] || [])];
        const normalized = normalizeAnswer(entry);
        return accepted.some((candidate) => normalizeAnswer(candidate) === normalized);
      });
    }
    return false;
  }

  function showReference(question, verdictText = "参考答案", verdictClass = "") {
    const panel = $(`[data-feedback="${question.number}"]`);
    const verdict = $(`[data-verdict="${question.number}"]`);
    if (!panel || !verdict) return;
    panel.hidden = false;
    verdict.textContent = verdictText;
    verdict.className = `feedback-verdict ${verdictClass}`.trim();
    const selfGrade = $(`[data-self-grade="${question.number}"]`);
    if (selfGrade) selfGrade.hidden = false;
  }

  function paintObjectiveResult(question, value, correct) {
    const card = $(`#question-${question.number}`);
    if (!card) return;
    card.classList.toggle("practice-correct-state", correct);
    card.classList.toggle("practice-wrong-state", !correct);
    if (["单选题", "多选题", "判断题"].includes(question.type)) {
      const correctLabels = referenceCorrectLabels(question);
      card.querySelectorAll(".option-row").forEach((row) => {
        const label = row.dataset.option;
        const input = row.querySelector("input");
        row.classList.toggle("correct-option", correctLabels.has(label));
        row.classList.toggle("wrong-option", input.checked && !correctLabels.has(label));
      });
    }
  }

  function recordPracticeResult(question, correct) {
    const number = question.number;
    const firstAttempt = !hasFirstResult(number);
    practice.attempts[number] = (Number(practice.attempts[number]) || 0) + 1;
    practice.latestResults[number] = correct;
    if (firstAttempt) practice.firstResults[number] = correct;

    const history = practice.history[number] || { attempts: 0 };
    if (!correct) {
      practice.history[number] = {
        ...history,
        wrong: true,
        mastered: false,
        attempts: (history.attempts || 0) + 1,
        lastWrongAt: new Date().toISOString(),
      };
    } else if (wrongOnly || history.wrong) {
      practice.history[number] = {
        ...history,
        wrong: Boolean(history.wrong),
        mastered: true,
        attempts: (history.attempts || 0) + 1,
        masteredAt: new Date().toISOString(),
      };
    }
  }

  function judgeQuestion(question) {
    const answers = collectAnswers();
    const value = answers[question.number];
    if (!isAnswered(question, value)) {
      alert(question.type === "填空题" ? "请填写全部空格后再确认。" : "请先选择答案。");
      return;
    }
    practice.answers = answers;
    const correct = isPracticeCorrect(question, value);
    recordPracticeResult(question, correct);
    paintObjectiveResult(question, value, correct);
    const correctAnswer = answerLabel(question);
    const retryNote = practice.firstResults[question.number] === false && correct ? "（本次已答对，首次结果仍计为错误）" : "";
    const masteredNote = wrongOnly && correct ? "（已掌握，将移出错题列表）" : "";
    showReference(
      question,
      correct ? `回答正确 ${retryNote}${masteredNote}` : `回答错误，正确答案：${correctAnswer}`,
      correct ? "correct" : "wrong",
    );
    updateSidebar();
    updatePracticeView();
    savePractice();
  }

  function restorePracticeFeedback() {
    paper.questions.forEach((question) => {
      if (practice.revealed[question.number]) showReference(question);
      if (Object.prototype.hasOwnProperty.call(practice.latestResults, question.number)) {
        const correct = practice.latestResults[question.number];
        paintObjectiveResult(question, practice.answers[question.number], correct);
        showReference(question, correct ? "最近一次回答正确" : `最近一次回答错误，正确答案：${answerLabel(question)}`, correct ? "correct" : "wrong");
      }
    });
  }

  function updatePracticeView() {
    if (!hasAnswers || mode !== "practice") return;
    const numbers = practiceQuestionNumbers();
    const visibleNumbers = new Set(numbers);
    const empty = numbers.length === 0;
    const emptyPanel = $("#practice-empty");
    if (emptyPanel) emptyPanel.hidden = !empty;
    paper.questions.forEach((question) => {
      const card = $(`#question-${question.number}`);
      if (card) card.hidden = !visibleNumbers.has(question.number);
    });
    updateSidebar();
  }

  function goToPracticeQuestion(number, scroll = true) {
    const numbers = practiceQuestionNumbers();
    if (!numbers.includes(number)) return;
    grid.querySelectorAll("a").forEach((link) => link.classList.remove("current"));
    grid.querySelector(`[data-nav="${number}"]`)?.classList.add("current");
    if (scroll) $(`#question-${number}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function switchMode(nextMode, { initial = false } = {}) {
    if (!hasAnswers || (nextMode === mode && !initial)) return;
    if (!initial) {
      if (mode === "exam") {
        examAnswers = collectAnswers();
        saveExam();
      } else {
        practice.answers = collectAnswers();
        savePractice();
      }
    }

    mode = nextMode;
    document.body.classList.toggle("practice-mode", mode === "practice");
    document.body.dataset.mode = mode;
    document.querySelectorAll(".mode-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
    $("#practice-panel").hidden = mode !== "practice";
    $("#submit-button").hidden = mode === "practice";
    $("#reset-button").hidden = mode === "practice";
    document.querySelectorAll(".practice-action").forEach((button) => { button.hidden = mode !== "practice"; });
    $("#mode-note-title").textContent = mode === "practice" ? "快速刷题模式" : "模拟考试模式";
    $("#mode-note-copy").textContent = mode === "practice"
      ? "选择后即时判定；错题会自动进入“错题模式：只刷错题”；解析已升级为考试记忆版。"
      : "模拟考试不显示答案、不自动评分；切换到快速刷题可即时判定并查看考试记忆版解析。";

    if (mode === "exam") {
      wrongOnly = false;
      applyAnswers(examAnswers);
      paper.questions.forEach((question) => { $(`#question-${question.number}`).hidden = false; });
      grid.querySelectorAll("a").forEach((link) => { link.hidden = false; });
      timer.textContent = formatTime(examElapsed);
      lockForCurrentMode();
      updateSidebar();
    } else {
      applyAnswers(practice.answers);
      restorePracticeFeedback();
      timer.textContent = formatTime(practice.elapsed);
      lockForCurrentMode();
      updatePracticeView();
    }
    try { localStorage.setItem(modeStorageKey, mode); } catch (error) { /* no-op */ }
  }

  function exportRecord() {
    if (mode === "exam") examAnswers = collectAnswers();
    if (mode === "practice") practice.answers = collectAnswers();
    const payload = {
      version: 2,
      paperId: paper.id,
      paperTitle: paper.title,
      exportedAt: new Date().toISOString(),
      exam: examSnapshot(),
      practice: hasAnswers ? practiceSnapshot() : null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${paper.id}-学习记录.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function applyImportedExam(saved) {
    if (!saved || saved.paperId !== paper.id) throw new Error("试卷编号不匹配");
    examElapsed = Number(saved.elapsed) || 0;
    submitted = Boolean(saved.submitted);
    examAnswers = saved.answers || {};
    writeStorage(examStorageKey, saved);
  }

  function importRecord(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const saved = JSON.parse(reader.result);
        if (saved.paperId !== paper.id) throw new Error("试卷编号不匹配");
        if (saved.version >= 2 && saved.exam) {
          applyImportedExam(saved.exam);
          if (hasAnswers && saved.practice) {
            practice = normalizePracticeState(saved.practice);
            writeStorage(practiceStorageKey, practice);
          }
        } else {
          applyImportedExam(saved);
        }
        switchMode(mode, { initial: true });
        alert("学习记录已导入。");
      } catch (error) {
        alert(`无法导入：${error.message}`);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  renderQuestions();
  loadRecords();
  if (hasAnswers) {
    switchMode(mode, { initial: true });
  } else {
    applyAnswers(examAnswers);
    timer.textContent = formatTime(examElapsed);
    lockForCurrentMode();
    updateSidebar();
  }
  startTimer();

  form.addEventListener("input", (event) => {
    if (mode === "exam") {
      updateSidebar();
      saveExam();
      return;
    }
    practice.answers = collectAnswers();
    savePractice();
    const card = event.target.closest(".question-card");
    if (card) card.classList.remove("practice-correct-state", "practice-wrong-state");
  });

  form.addEventListener("change", (event) => {
    if (mode === "exam") {
      updateSidebar();
      saveExam();
      return;
    }
    practice.answers = collectAnswers();
    const card = event.target.closest(".question-card");
    const question = paper.questions.find((item) => item.number === Number(card?.dataset.question));
    if (question && ["单选题", "判断题"].includes(question.type)) judgeQuestion(question);
    else savePractice();
  });

  document.querySelectorAll(".mark-button").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".question-card");
      const marked = card.classList.toggle("marked");
      button.textContent = marked ? "◆" : "◇";
    });
  });

  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => switchMode(button.dataset.mode));
  });

  questionsRoot.addEventListener("click", (event) => {
    const confirmButton = event.target.closest(".confirm-answer");
    if (confirmButton) {
      const question = paper.questions.find((item) => item.number === Number(confirmButton.dataset.confirm));
      if (question) judgeQuestion(question);
      return;
    }
    const revealButton = event.target.closest(".reveal-answer");
    if (revealButton) {
      const question = paper.questions.find((item) => item.number === Number(revealButton.dataset.reveal));
      if (!question) return;
      practice.revealed[question.number] = true;
      showReference(question);
      savePractice();
      return;
    }
    const gradeButton = event.target.closest(".self-grade-button");
    if (gradeButton) {
      const wrapper = gradeButton.closest(".self-grade");
      const question = paper.questions.find((item) => item.number === Number(wrapper.dataset.selfGrade));
      if (!question) return;
      const correct = gradeButton.dataset.grade === "correct";
      recordPracticeResult(question, correct);
      const card = $(`#question-${question.number}`);
      card.classList.toggle("practice-correct-state", correct);
      card.classList.toggle("practice-wrong-state", !correct);
      showReference(question, correct ? "已标记为会做" : "已加入错题记录", correct ? "correct" : "wrong");
      updateSidebar();
      updatePracticeView();
      savePractice();
      return;
    }
    if (event.target.closest("#return-all-questions")) {
      wrongOnly = false;
      updatePracticeView();
    }
  });

  $("#submit-button").addEventListener("click", () => {
    const progress = examProgress();
    const message = progress.unanswered ? `还有 ${progress.unanswered} 题未作答，仍要交卷吗？` : "确认交卷吗？交卷后答题框将锁定。";
    if (!confirm(message)) return;
    submitted = true;
    lockForCurrentMode();
    saveExam();
    showSummary();
  });

  $("#reset-button").addEventListener("click", () => {
    if (!confirm("确认清空本试卷的模拟考试答案和计时吗？刷题错题记录不会受影响。")) return;
    try { localStorage.removeItem(examStorageKey); } catch (error) { /* no-op */ }
    examAnswers = {};
    examElapsed = 0;
    submitted = false;
    applyAnswers({});
    timer.textContent = formatTime(0);
    lockForCurrentMode();
    updateSidebar();
    storageStatus.textContent = "已清空模拟考试记录，重新开始作答。";
  });

  $("#reset-practice-button")?.addEventListener("click", () => {
    if (!confirm("确认重置本轮刷题答案、首次结果和计时吗？历史错题记录会保留。")) return;
    const history = practice.history;
    practice = emptyPracticeState();
    practice.history = history;
    applyAnswers({});
    timer.textContent = formatTime(0);
    updatePracticeView();
    savePractice();
  });

  $("#clear-wrong-button")?.addEventListener("click", () => {
    if (!confirm("确认清空本试卷的全部历史错题记录吗？本轮作答统计会保留。")) return;
    practice.history = {};
    wrongOnly = false;
    updatePracticeView();
    savePractice();
  });

  $("#wrong-only-button")?.addEventListener("click", () => {
    if (!wrongOnly && activeWrongCount() === 0) return;
    wrongOnly = !wrongOnly;
    if (wrongOnly) {
      paper.questions.forEach((question) => {
        const record = practice.history[question.number];
        if (!record?.wrong || record?.mastered) return;
        delete practice.answers[question.number];
        delete practice.latestResults[question.number];
        delete practice.revealed[question.number];
      });
      applyAnswers(practice.answers);
      restorePracticeFeedback();
    }
    updatePracticeView();
    savePractice();
  });

  $("#export-button").addEventListener("click", exportRecord);
  $("#import-input").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) importRecord(file);
    event.target.value = "";
  });
  $("#print-button").addEventListener("click", () => window.print());
  $("#close-summary").addEventListener("click", () => { $("#summary-modal").hidden = true; });
  $("#mobile-nav-button").addEventListener("click", () => sidebar.classList.add("open"));
  $("#close-nav").addEventListener("click", () => sidebar.classList.remove("open"));
  grid.addEventListener("click", (event) => {
    const link = event.target.closest("[data-nav]");
    if (mode === "practice" && link) {
      event.preventDefault();
      goToPracticeQuestion(Number(link.dataset.nav));
    }
    sidebar.classList.remove("open");
  });

  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    grid.querySelectorAll("a").forEach((link) => link.classList.remove("current"));
    const number = visible.target.dataset.question;
    grid.querySelector(`[data-nav="${number}"]`)?.classList.add("current");
  }, { rootMargin: "-25% 0px -60% 0px", threshold: [0.1, 0.5] });
  document.querySelectorAll(".question-card").forEach((card) => observer.observe(card));

  window.addEventListener("beforeunload", () => {
    if (mode === "exam") saveExam();
    else savePractice();
  });
})();
