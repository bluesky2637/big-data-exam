(() => {
  const params = new URLSearchParams(location.search);
  const requestedPath = params.get('paper') || 'papers/paper-09.html';
  const resolvedPath = new URL(requestedPath, location.href);
  const safePath = /\/papers\/paper-\d{2}\.html$/.test(resolvedPath.pathname)
    && resolvedPath.origin === location.origin
    ? requestedPath
    : 'papers/paper-09.html';
  const groupSize = 20;
  const practice = window.ExamPractice;
  let paper = null;
  let state = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value = '') => {
    const node = document.createElement('span');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  };
  const escapeAttribute = (value = '') => escapeHtml(value).replace(/"/g, '&quot;');

  function storageKey() {
    return `challenge20:${paper.id}:v2`;
  }

  function emptyState() {
    return {
      version: 2,
      paperId: paper.id,
      groupIndex: 0,
      phase: 'study',
      wrongNumbers: [],
      masteredNumbers: [],
      answers: {},
      subjectiveGrades: {},
      revealed: {},
      firstResults: {},
      latestResults: {},
      attempts: {},
      savedAt: null,
    };
  }

  function normalizeState(saved) {
    const fallback = emptyState();
    if (!saved) return fallback;
    if (saved.version === 1 || !saved.paperId) {
      return { ...fallback, groupIndex: Number(saved.groupIndex) || 0 };
    }
    if (saved.paperId !== paper.id) return fallback;
    const validPhases = new Set(['study', 'test', 'wrong', 'pass']);
    return {
      ...fallback,
      ...saved,
      version: 2,
      paperId: paper.id,
      groupIndex: Number(saved.groupIndex) || 0,
      phase: validPhases.has(saved.phase) ? saved.phase : 'study',
      wrongNumbers: Array.isArray(saved.wrongNumbers) ? saved.wrongNumbers : [],
      masteredNumbers: Array.isArray(saved.masteredNumbers) ? saved.masteredNumbers : [],
      answers: saved.answers || {},
      subjectiveGrades: saved.subjectiveGrades || {},
      revealed: saved.revealed || {},
      firstResults: saved.firstResults || {},
      latestResults: saved.latestResults || {},
      attempts: saved.attempts || {},
    };
  }

  function loadState() {
    try {
      const current = JSON.parse(localStorage.getItem(storageKey()) || 'null');
      const legacy = JSON.parse(localStorage.getItem(`challenge20:${paper.id}:v1`) || 'null');
      state = normalizeState(current || legacy);
    } catch (error) {
      state = emptyState();
    }
    const maxGroup = Math.max(Math.ceil(paper.questions.length / groupSize) - 1, 0);
    state.groupIndex = Math.min(Math.max(state.groupIndex, 0), maxGroup);
  }

  function saveState() {
    state.savedAt = new Date().toISOString();
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch (error) {
      ExamUI.announce('浏览器无法保存闯关进度，本页关闭后记录可能丢失。');
    }
  }

  function labels(question) {
    return practice.correctLabels(question);
  }

  function answerLabel(question) {
    const answers = labels(question);
    if (question.type === '填空题') {
      return answers.map((value, index) => `第${index + 1}空：${value}`).join('；');
    }
    return answers.join('、');
  }

  function referenceHtml(question) {
    const reference = question.reference;
    const answer = practice.isObjective(question)
      ? `<p><b>答案：</b>${escapeHtml(answerLabel(question))}</p>`
      : `<div><b>参考要点：</b><ol>${reference.answer.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ol></div>`;
    return `<div class="challenge-answer">
      ${answer}
      <div class="challenge-explain"><b>解析：</b>${escapeHtml(reference.explanation || '暂无解析')}</div>
      <div class="challenge-source"><b>教材出处：</b>${escapeHtml(reference.source || '未标注')}
        <span class="basis-badge">${escapeHtml(reference.basis || '未标注')}</span>
      </div>
    </div>`;
  }

  function groupQuestions() {
    const start = state.groupIndex * groupSize;
    return paper.questions.slice(start, start + groupSize);
  }

  function activeQuestions() {
    if (state.phase === 'wrong') {
      const active = new Set(state.wrongNumbers);
      return groupQuestions().filter((question) => active.has(question.number));
    }
    return groupQuestions();
  }

  function questionValue(question) {
    if (!practice.isObjective(question)) {
      return Object.prototype.hasOwnProperty.call(state.subjectiveGrades, question.number)
        ? state.subjectiveGrades[question.number]
        : undefined;
    }
    return state.answers[question.number];
  }

  function renderObjectiveControl(question, reveal) {
    const saved = state.answers[question.number];
    if (question.type === '填空题') {
      const count = Math.max(question.blank_count || labels(question).length || 1, 1);
      return Array.from({ length: count }, (_, index) => `
        <label>
          <span class="sr-only">第${index + 1}空</span>
          <input class="challenge-blank" data-question="${question.number}" data-blank="${index}"
            value="${escapeAttribute(Array.isArray(saved) ? saved[index] || '' : '')}"
            placeholder="第${index + 1}空" ${reveal ? 'disabled' : ''}>
        </label>`).join('');
    }
    const inputType = question.type === '多选题' ? 'checkbox' : 'radio';
    const selected = new Set(Array.isArray(saved) ? saved : [saved]);
    const correct = new Set(labels(question));
    return `<div class="challenge-options">${(question.options || []).map((option) => `
      <label class="challenge-option ${reveal && correct.has(option.label) ? 'right' : ''}">
        <input type="${inputType}" name="q-${question.number}" value="${option.label}"
          data-question="${question.number}" ${selected.has(option.label) ? 'checked' : ''} ${reveal ? 'disabled' : ''}>
        <b>${option.label}</b><span>${option.html || escapeHtml(option.text)}</span>
      </label>`).join('')}</div>`;
  }

  function renderSubjectiveControl(question, reveal) {
    const saved = state.answers[question.number];
    if (state.phase === 'study') return '';
    const grade = state.subjectiveGrades[question.number];
    return `
      <label>
        <span class="sr-only">第${question.number}题作答区</span>
        <textarea class="challenge-essay" data-question="${question.number}" placeholder="可先写下自己的回答，再查看参考答案">${escapeHtml(typeof saved === 'string' ? saved : '')}</textarea>
      </label>
      ${!reveal ? `<button class="button button-quiet" type="button" data-reveal="${question.number}">查看参考答案并自评</button>` : ''}
      ${reveal ? `<div class="challenge-self-grade">
        <span>对照后自评：</span>
        <button class="button button-primary" type="button" data-grade="${question.number}" data-result="true" aria-pressed="${grade === true}">会做</button>
        <button class="button button-danger" type="button" data-grade="${question.number}" data-result="false" aria-pressed="${grade === false}">不会</button>
      </div>` : ''}`;
  }

  function renderCard(question) {
    const reveal = state.phase === 'study' || Boolean(state.revealed[question.number]);
    const latest = state.latestResults[question.number];
    const resultClass = latest === true ? 'correct' : latest === false ? 'wrong' : '';
    return `<article class="challenge-card ${resultClass}" id="q-${question.number}">
      <div class="challenge-qhead">
        <span class="challenge-qno">${question.number}</span>
        <span class="challenge-type">${escapeHtml(question.type)}</span>
        <span>${question.score || 1} 分</span>
      </div>
      <div class="challenge-stem">${question.stem_html}</div>
      ${practice.isObjective(question)
        ? renderObjectiveControl(question, state.phase === 'study')
        : renderSubjectiveControl(question, reveal)}
      ${reveal ? referenceHtml(question) : ''}
    </article>`;
  }

  function render() {
    const questions = activeQuestions();
    const start = state.groupIndex * groupSize + 1;
    const end = Math.min(start + groupSize - 1, paper.questions.length);
    const groupCount = Math.ceil(paper.questions.length / groupSize);
    const lastGroup = state.groupIndex === groupCount - 1;
    const phaseNames = { study: '先背答案', test: '正在做题', wrong: '错题重做', pass: '本组通过' };

    $('#groupNo').textContent = `${state.groupIndex + 1}/${groupCount}`;
    $('#rangeText').textContent = `${start}-${end}`;
    $('#phaseText').textContent = phaseNames[state.phase];
    $('#wrongCount').textContent = state.wrongNumbers.length;
    $('#startBtn').hidden = state.phase !== 'study';
    $('#startBtn').textContent = state.wrongNumbers.length ? '继续重做错题' : '开始做这20题';
    $('#submitBtn').hidden = state.phase !== 'test';
    $('#submitWrongBtn').hidden = state.phase !== 'wrong';
    $('#nextBtn').hidden = state.phase !== 'pass';
    $('#nextBtn').textContent = lastGroup ? '返回题库首页' : '进入下一组20题';
    $('#backStudyBtn').hidden = state.phase === 'study';
    $('#passPanel').hidden = state.phase !== 'pass';
    $('#passTitle').textContent = lastGroup ? '全部闯关完成' : '本组已通过';
    $('#passCopy').textContent = lastGroup
      ? `你已经完成《${paper.title}》的全部闯关。`
      : '这一组题已经全部做对，可以进入下一组。';

    const hints = {
      study: state.wrongNumbers.length
        ? '正在复习本组答案。点击“继续重做错题”后，只显示尚未掌握的题。'
        : '先把本组答案、解析和教材出处看一遍，背完后开始作答。',
      test: '答案已隐藏。客观题完成后统一提交；主观题查看参考答案后选择“会做”或“不会”。',
      wrong: '这里只显示本组尚未掌握的错题。全部答对或自评会做后，本组通过。',
      pass: lastGroup ? '全部分组已完成。' : '本组已经通过，可以进入下一组。',
    };
    $('#modeHint').textContent = hints[state.phase];
    $('#questions').innerHTML = questions.map(renderCard).join('');
    ExamUI.announce(`${phaseNames[state.phase]}，当前显示${questions.length}题。`);
  }

  function updateAnswerFromControl(control) {
    const number = Number(control.dataset.question);
    const question = paper.questions.find((item) => item.number === number);
    if (!question) return;
    if (control.matches('.challenge-essay')) {
      state.answers[number] = control.value;
    } else if (question.type === '填空题') {
      const inputs = [...document.querySelectorAll(`[data-question="${number}"][data-blank]`)];
      state.answers[number] = inputs.map((input) => input.value);
    } else if (question.type === '多选题') {
      state.answers[number] = [...document.querySelectorAll(`input[name="q-${number}"]:checked`)]
        .map((input) => input.value);
    } else {
      state.answers[number] = document.querySelector(`input[name="q-${number}"]:checked`)?.value || '';
    }
    saveState();
  }

  function recordResult(question, correct) {
    const number = question.number;
    state.attempts[number] = (Number(state.attempts[number]) || 0) + 1;
    state.latestResults[number] = correct;
    if (!Object.prototype.hasOwnProperty.call(state.firstResults, number)) {
      state.firstResults[number] = correct;
    }
    if (state.phase === 'wrong' && correct && !state.masteredNumbers.includes(number)) {
      state.masteredNumbers.push(number);
    }
  }

  async function submitCurrent() {
    const questions = activeQuestions();
    const missing = questions.filter((question) => !practice.isAnswered(question, questionValue(question)));
    if (missing.length) {
      await ExamUI.message(
        `还有 ${missing.length} 道题没有完成。主观题需要查看参考答案并选择“会做”或“不会”。`,
        '尚未完成',
      );
      document.querySelector(`#q-${missing[0].number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const wrong = questions.filter((question) => !practice.isCorrect(question, questionValue(question)));
    questions.forEach((question) => recordResult(question, !wrong.includes(question)));

    if (wrong.length) {
      state.wrongNumbers = wrong.map((question) => question.number);
      wrong.forEach((question) => {
        delete state.answers[question.number];
        delete state.subjectiveGrades[question.number];
        delete state.revealed[question.number];
      });
      state.phase = 'wrong';
      saveState();
      render();
      await ExamUI.message(`本组还有 ${wrong.length} 道题需要重做，接下来只显示这些题。`, '进入错题重做');
      return;
    }

    state.wrongNumbers = [];
    state.phase = 'pass';
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('#questions').addEventListener('input', (event) => {
    if (event.target.matches('[data-question]')) updateAnswerFromControl(event.target);
  });

  $('#questions').addEventListener('change', (event) => {
    if (event.target.matches('[data-question]')) updateAnswerFromControl(event.target);
  });

  $('#questions').addEventListener('click', (event) => {
    const revealButton = event.target.closest('[data-reveal]');
    if (revealButton) {
      const number = Number(revealButton.dataset.reveal);
      state.revealed[number] = true;
      saveState();
      render();
      document.querySelector(`#q-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const gradeButton = event.target.closest('[data-grade]');
    if (gradeButton) {
      const number = Number(gradeButton.dataset.grade);
      state.subjectiveGrades[number] = gradeButton.dataset.result === 'true';
      saveState();
      render();
      document.querySelector(`#q-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  $('#startBtn').addEventListener('click', () => {
    state.phase = state.wrongNumbers.length ? 'wrong' : 'test';
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#submitBtn').addEventListener('click', submitCurrent);
  $('#submitWrongBtn').addEventListener('click', submitCurrent);
  $('#nextBtn').addEventListener('click', () => {
    const lastGroup = (state.groupIndex + 1) * groupSize >= paper.questions.length;
    if (lastGroup) {
      location.href = 'index.html';
      return;
    }
    state.groupIndex += 1;
    state.phase = 'study';
    state.wrongNumbers = [];
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#backStudyBtn').addEventListener('click', () => {
    state.phase = 'study';
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#resetBtn').addEventListener('click', async () => {
    const accepted = await ExamUI.confirm('确认清空本试卷的全部闯关进度并从第1组重新开始吗？', '重置闯关进度', '确认重置');
    if (!accepted) return;
    state = emptyState();
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  fetch(safePath)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const data = doc.querySelector('#exam-data');
      if (!data) throw new Error('未找到试卷数据');
      paper = JSON.parse(data.textContent);
      if (!paper.has_answers) throw new Error('这套试卷暂未提供答案，不能使用闯关模式');
      document.title = `20题闯关模式 | ${paper.title}`;
      $('#title').textContent = paper.title;
      loadState();
      render();
    })
    .catch(async (error) => {
      $('#title').textContent = '题库加载失败';
      $('#modeHint').textContent = error.message;
      await ExamUI.message(`无法加载题库：${error.message}`, '加载失败');
    });
})();
