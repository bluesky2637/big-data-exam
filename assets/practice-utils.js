((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExamPractice = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, () => {
  function normalizeAnswer(value) {
    return String(value || '')
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase('zh-CN')
      .replace(/\s+/g, ' ');
  }

  function correctLabels(question) {
    return question.reference?.answer || [];
  }

  function isObjective(question) {
    return ['单选题', '多选题', '判断题', '填空题'].includes(question.type);
  }

  function isAnswered(question, value) {
    if (!isObjective(question)) return typeof value === 'boolean';
    if (question.type === '多选题') return Array.isArray(value) && value.length > 0;
    if (question.type === '填空题') {
      return Array.isArray(value)
        && value.length === Math.max(question.blank_count || correctLabels(question).length || 1, 1)
        && value.every((entry) => String(entry || '').trim());
    }
    return Boolean(value);
  }

  function isCorrect(question, value) {
    const reference = question.reference;
    if (!reference) return false;
    if (!isObjective(question)) return value === true;
    if (question.type === '单选题' || question.type === '判断题') {
      return value === reference.answer[0];
    }
    if (question.type === '多选题') {
      const selected = new Set(Array.isArray(value) ? value : []);
      const expected = new Set(reference.answer);
      return selected.size === expected.size
        && [...selected].every((item) => expected.has(item));
    }
    if (question.type === '填空题') {
      if (!Array.isArray(value) || value.length !== question.blank_count) return false;
      return value.every((entry, index) => {
        const accepted = [
          reference.answer[index],
          ...((reference.accepted && reference.accepted[index]) || []),
        ];
        const normalized = normalizeAnswer(entry);
        return accepted.some((candidate) => normalizeAnswer(candidate) === normalized);
      });
    }
    return false;
  }

  return {
    normalizeAnswer,
    correctLabels,
    isObjective,
    isAnswered,
    isCorrect,
  };
});
