import { QuizQuestion, QuizQuestionType } from '../types';
import bundledQuestions from '../questions.json';

// ============= 存储层（localStorage） =============

const KEY_QUESTIONS = 'arquiz.questions';
const KEY_ATTEMPTS = 'arquiz.attempts';
const KEY_ANSWERS = 'arquiz.answers'; // { [questionId]: { isCorrect, userAnswer, answeredAt } }
const KEY_WRONG = 'arquiz.wrong';     // { [questionId]: { wrongCount, streak, mastered, lastWrongAt } }
const KEY_VERSION = 'arquiz.version';
const DATA_VERSION = '1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'q-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// 首次访问：用内置题库初始化
export function initStore(): void {
  const ver = localStorage.getItem(KEY_VERSION);
  if (ver !== DATA_VERSION) {
    // 版本升级时重置学习数据，重新注入题库
    if (!localStorage.getItem(KEY_QUESTIONS) || ver === null) {
      write(KEY_QUESTIONS, bundledQuestions);
      write(KEY_ATTEMPTS, []);
      write(KEY_ANSWERS, {});
      write(KEY_WRONG, {});
    }
    localStorage.setItem(KEY_VERSION, DATA_VERSION);
  }
  if (!localStorage.getItem(KEY_QUESTIONS)) {
    write(KEY_QUESTIONS, bundledQuestions);
  }
}

// ============= 答案工具（与后端逻辑一致） =============

export function normalizeAnswer(raw: string): string {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/[Ａ-Ｈａ-ｈ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  s = s.replace(/[\s、,，;；/\\]/g, '');
  s = s.toUpperCase();
  return s;
}

export function isJudgeAnswer(raw: string): boolean {
  const s = normalizeAnswer(raw);
  return ['对', '错', '正确', '错误', '√', '×', 'X', 'T', 'F', '是', '否'].includes(s);
}

export function toJudgeAnswer(raw: string): string {
  const s = normalizeAnswer(raw);
  if (['对', '正确', '√', 'T', '是'].includes(s)) return '对';
  if (['错', '错误', '×', 'X', 'F', '否'].includes(s)) return '错';
  return s;
}

export function isLetterAnswer(raw: string): boolean {
  const s = normalizeAnswer(raw);
  return s.length > 0 && s.length <= 8 && /^[A-H]+$/.test(s);
}

export function gradeAnswer(
  type: QuizQuestionType,
  correctAnswer: string,
  userAnswer: string | null | undefined
): boolean {
  if (!userAnswer) return false;
  if (type === 'short') {
    const u = String(userAnswer).trim();
    const c = correctAnswer.trim();
    if (!u) return false;
    return u.includes(c) || c.includes(u);
  }
  if (type === 'multiple') {
    const u = normalizeAnswer(userAnswer).split('').sort().join('');
    const c = normalizeAnswer(correctAnswer).split('').sort().join('');
    return u === c;
  }
  const c = type === 'judge' ? toJudgeAnswer(correctAnswer) : normalizeAnswer(correctAnswer);
  const uu = type === 'judge' ? toJudgeAnswer(userAnswer) : normalizeAnswer(userAnswer);
  return uu === c;
}

export function parseOptionsFromCell(cell: string): Record<string, string> | null {
  if (!cell || !cell.trim()) return null;
  const text = String(cell);
  const pattern = /(?:(?:（|\()[A-Ha-h](?:）|\))|[A-Ha-h]\s*[.、:：)）\]])/g;
  const matches = Array.from(text.matchAll(pattern));
  if (matches.length < 2) return null;
  const options: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const letterMatch = m[0].match(/[A-Ha-h]/);
    if (!letterMatch) continue;
    const letter = letterMatch[0].toUpperCase();
    const value = text.slice(start, end).trim().replace(/^[.、:：)\]]\s*/, '');
    if (value) options[letter] = value;
  }
  return Object.keys(options).length >= 2 ? options : null;
}

// ============= 题库操作 =============

export function getQuestions(): QuizQuestion[] {
  return read<QuizQuestion[]>(KEY_QUESTIONS, []);
}

export function getMeta(): {
  categories: Array<{ name: string; count: number }>;
  types: Array<{ type: QuizQuestionType; count: number }>;
} {
  const qs = getQuestions();
  const catMap = new Map<string, number>();
  const typeMap = new Map<QuizQuestionType, number>();
  for (const q of qs) {
    catMap.set(q.category, (catMap.get(q.category) || 0) + 1);
    typeMap.set(q.type, (typeMap.get(q.type) || 0) + 1);
  }
  return {
    categories: [...catMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    types: [...typeMap.entries()].map(([type, count]) => ({ type, count })),
  };
}

export function listQuestions(opts: { search?: string; category?: string; type?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.max(1, opts.pageSize || 20);
  let qs = getQuestions();
  if (opts.search) {
    const kw = opts.search.toLowerCase();
    qs = qs.filter(q =>
      q.question.toLowerCase().includes(kw) ||
      (q.analysis || '').toLowerCase().includes(kw) ||
      (q.subcategory || '').toLowerCase().includes(kw)
    );
  }
  if (opts.category && opts.category !== 'all') qs = qs.filter(q => q.category === opts.category);
  if (opts.type && opts.type !== 'all') qs = qs.filter(q => q.type === opts.type);
  const total = qs.length;
  const start = (page - 1) * pageSize;
  return { total, page, pageSize, questions: qs.slice(start, start + pageSize) };
}

export function clearQuestions(): number {
  const n = getQuestions().length;
  // 重置为内置题库，同时清空学习记录
  write(KEY_QUESTIONS, bundledQuestions);
  write(KEY_ATTEMPTS, []);
  write(KEY_ANSWERS, {});
  write(KEY_WRONG, {});
  return n;
}

// ============= Excel 解析导入（客户端） =============

const HEADER_MAP: Record<string, string[]> = {
  type: ['题型', '类型', '题目类型', '试题类型', 'type'],
  question: ['题干', '题目', '问题', '题', 'question', 'content'],
  options: ['选项', '选项内容', 'options', '备选'],
  optionA: ['选项a', 'a选项', 'a', 'optiona', '选项甲'],
  optionB: ['选项b', 'b选项', 'b', 'optionb'],
  optionC: ['选项c', 'c选项', 'c', 'optionc'],
  optionD: ['选项d', 'd选项', 'd', 'optiond'],
  optionE: ['选项e', 'e选项', 'e', 'optione'],
  optionF: ['选项f', 'f选项', 'f', 'optionf'],
  answer: ['答案', '正确答案', '参考答案', '标准答案', 'answer'],
  analysis: ['解析', '答案解析', '题目解析', '说明', '详解', 'analysis', 'explanation'],
  category: ['分类', '章节', '科目', '知识点', '所属章节', 'category'],
  difficulty: ['难度', '难度等级', 'difficulty'],
};

const FALLBACK_ORDER = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'answer', 'analysis'];

function normalizeHeader(h: string): string {
  return String(h || '').trim().toLowerCase().replace(/[\s（）()：:]/g, '');
}

function matchHeader(h: string): string | null {
  const n = normalizeHeader(h);
  if (!n) return null;
  for (const [field, keys] of Object.entries(HEADER_MAP)) {
    if (keys.includes(n)) return field;
  }
  for (const [field, keys] of Object.entries(HEADER_MAP)) {
    for (const k of keys) {
      if (k.length >= 2 && n.includes(k.toLowerCase())) {
        if (field === 'options' && /选项[a-h]/.test(n)) continue;
        return field;
      }
    }
  }
  return null;
}

interface ParsedQuestion {
  type: QuizQuestionType;
  category: string;
  subcategory: string;
  question: string;
  options: Record<string, string> | null;
  answer: string;
  analysis: string;
  difficulty: string;
}

function parseRow(row: Record<string, any>, sheetCategory: string, subcategory: string, rowNum: number): ParsedQuestion | string {
  const questionText = String(row.question ?? '').trim();
  if (!questionText) return `第 ${rowNum} 行：题干为空，已跳过`;
  const rawAnswer = String(row.answer ?? '').trim();
  if (!rawAnswer) return `第 ${rowNum} 行：答案为空，已跳过`;

  const options: Record<string, string> = {};
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const v = String(row[`option${letter}`] ?? '').trim();
    if (v) options[letter] = v;
  }
  if (Object.keys(options).length === 0 && row.options) {
    const parsed = parseOptionsFromCell(String(row.options));
    if (parsed) Object.assign(options, parsed);
  }

  const analysis = String(row.analysis ?? '').trim();
  const category = String(row.category ?? '').trim() || sheetCategory;
  const difficulty = String(row.difficulty ?? '').trim() || '普通';
  const normalized = normalizeAnswer(rawAnswer);

  let type: QuizQuestionType;
  if (Object.keys(options).length === 0 && isJudgeAnswer(rawAnswer)) {
    type = 'judge';
  } else if (Object.keys(options).length > 0 && isLetterAnswer(rawAnswer)) {
    type = normalized.length > 1 ? 'multiple' : 'single';
  } else if (/^[A-H]+(\s*[,、，]\s*[A-H]+)*$/.test(normalized) && normalized.length > 0) {
    type = normalized.length > 1 ? 'multiple' : 'single';
  } else if (isJudgeAnswer(rawAnswer)) {
    type = 'judge';
  } else {
    type = 'short';
  }

  let finalQuestion = questionText;
  const finalOptions = { ...options };
  if (Object.keys(finalOptions).length === 0 && (type === 'single' || type === 'multiple')) {
    const parsed = parseOptionsFromCell(questionText);
    if (parsed) {
      finalQuestion = questionText.slice(0, questionText.search(/[（(]?[A-H][.、:：)）\]]/)).trim() || questionText;
      Object.assign(finalOptions, parsed);
    }
  }

  return {
    type,
    category,
    subcategory,
    question: finalQuestion,
    options: type === 'judge' ? null : (Object.keys(finalOptions).length > 0 ? finalOptions : null),
    answer: type === 'judge' ? toJudgeAnswer(rawAnswer) : normalized,
    analysis,
    difficulty,
  };
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function importWorkbook(wb: any, XLSX: { utils: { sheet_to_json: Function } }, existingIds: Set<string>): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  const newQuestions: QuizQuestion[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as any[][];
    if (!rows || rows.length === 0) continue;

    let headerRowIdx = -1;
    let colMap: Record<string, number> = {};
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const candidate = rows[i].map((c: any) => matchHeader(String(c ?? '')));
      const matched = candidate.filter(Boolean).length;
      const hasKey = candidate.some((c: any) => c === 'question' || c === 'answer');
      if (matched >= 2 && hasKey) {
        headerRowIdx = i;
        candidate.forEach((field: string | null, idx: number) => {
          if (field && !(field in colMap)) colMap[field] = idx;
        });
        break;
      }
    }
    let useFallback = false;
    if (headerRowIdx === -1) {
      useFallback = true;
      headerRowIdx = 0;
      colMap = {};
      FALLBACK_ORDER.forEach((field, idx) => { colMap[field] = idx; });
    }
    if (useFallback && result.errors.length < 20) {
      result.errors.push(`工作表「${sheetName}」未识别到表头，已按默认列顺序解析`);
    }

    const sheetCategory = sheetName.trim() || '未分类';
    // 二级分类列（若有）
    let subcategory = '';
    if (!useFallback && rows[headerRowIdx]) {
      for (let c = 0; c < rows[headerRowIdx].length; c++) {
        const h = String(rows[headerRowIdx][c] ?? '').trim();
        if (/^(二级|二级分类|子分类)$/.test(h)) {
          subcategory = String(rows[headerRowIdx + 1]?.[c] ?? '').trim();
          break;
        }
      }
    }

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const rowArr = rows[r] as any[];
      if (!rowArr || rowArr.every(c => String(c ?? '').trim() === '')) continue;
      const rowData: Record<string, any> = {};
      for (const [field, idx] of Object.entries(colMap)) {
        rowData[field] = rowArr[idx];
      }
      for (let c = 0; c < rowArr.length; c++) {
        const headerCell = String((rows[headerRowIdx] as any[])[c] ?? '').trim().toUpperCase();
        const m = headerCell.match(/^([A-H])$/);
        if (m) rowData[`option${m[1]}`] = rowArr[c];
      }
      const parsed = parseRow(rowData, sheetCategory, subcategory, r + 1);
      if (typeof parsed === 'string') {
        result.skipped++;
        if (result.errors.length < 20) result.errors.push(parsed);
        continue;
      }
      if (existingIds.size > 0) {
        // 按「题干+答案」去重
        const dupKey = parsed.question + '|' + parsed.answer;
        if (existingIds.has(dupKey)) { result.skipped++; continue; }
        existingIds.add(dupKey);
      }
      newQuestions.push({ id: uid(), ...parsed });
      result.imported++;
    }
  }

  if (newQuestions.length > 0) {
    write(KEY_QUESTIONS, [...getQuestions(), ...newQuestions]);
  }
  return result;
}

// ============= 测验 =============

export interface AttemptRecord {
  id: string;
  mode: string;
  total: number;
  correct: number;
  score: number;
  duration_sec: number;
  started_at: string;
  finished_at: string | null;
}

export function pickQuestions(opts: {
  count: number; // 0 = 全部
  categories?: string[];
}): QuizQuestion[] {
  let qs = getQuestions();
  if (opts.categories && opts.categories.length > 0) {
    qs = qs.filter(q => opts.categories!.includes(q.category));
  }
  // 洗牌
  for (let i = qs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [qs[i], qs[j]] = [qs[j], qs[i]];
  }
  return opts.count === 0 ? qs : qs.slice(0, opts.count);
}

export function pickWrongQuestions(): QuizQuestion[] {
  const wrong = read<Record<string, { wrongCount: number; streak: number; mastered: number }>>(KEY_WRONG, {});
  const active = Object.entries(wrong).filter(([, v]) => v.mastered !== 1);
  const idMap = new Map(active.map(([id, v]) => [id, v]));
  return getQuestions()
    .filter(q => idMap.has(q.id))
    .map(q => ({ ...q, wrong_count: idMap.get(q.id)!.wrongCount, streak: idMap.get(q.id)!.streak }));
}

export function createAttempt(mode: string, total: number): string {
  const id = uid();
  const attempts = read<AttemptRecord[]>(KEY_ATTEMPTS, []);
  attempts.push({ id, mode, total, correct: 0, score: 0, duration_sec: 0, started_at: new Date().toISOString(), finished_at: null });
  write(KEY_ATTEMPTS, attempts);
  return id;
}

export function submitAttempt(
  attemptId: string,
  answers: Array<{ questionId: string; userAnswer: string | null }>,
  durationSec: number
): {
  total: number;
  correct: number;
  score: number;
  results: Array<{ questionId: string; isCorrect: boolean; correctAnswer: string; userAnswer: string | null }>;
} {
  const qs = getQuestions();
  const qMap = new Map(qs.map(q => [q.id, q]));
  const answersStore = read<Record<string, { isCorrect: boolean; userAnswer: string; answeredAt: string }>>(KEY_ANSWERS, {});
  const wrong = read<Record<string, { wrongCount: number; streak: number; mastered: number; lastWrongAt: string }>>(KEY_WRONG, {});

  const results: Array<{ questionId: string; isCorrect: boolean; correctAnswer: string; userAnswer: string | null }> = [];
  let correct = 0;
  const now = new Date().toISOString();

  for (const a of answers) {
    const q = qMap.get(a.questionId);
    if (!q) continue;
    const isCorrect = gradeAnswer(q.type, q.answer, a.userAnswer);
    if (isCorrect) correct++;
    answersStore[a.questionId] = { isCorrect, userAnswer: a.userAnswer ?? '', answeredAt: now };
    if (isCorrect) {
      if (wrong[a.questionId]) {
        const w = wrong[a.questionId];
        w.streak += 1;
        if (w.streak >= 2) w.mastered = 1;
      }
    } else {
      const w = wrong[a.questionId] || { wrongCount: 0, streak: 0, mastered: 0, lastWrongAt: now };
      w.wrongCount += 1;
      w.streak = 0;
      w.mastered = 0;
      w.lastWrongAt = now;
      wrong[a.questionId] = w;
    }
    results.push({ questionId: a.questionId, isCorrect, correctAnswer: q.answer, userAnswer: a.userAnswer ?? null });
  }

  write(KEY_ANSWERS, answersStore);
  write(KEY_WRONG, wrong);

  const attempts = read<AttemptRecord[]>(KEY_ATTEMPTS, []);
  const idx = attempts.findIndex(a => a.id === attemptId);
  const total = results.length;
  const score = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;
  if (idx >= 0) {
    attempts[idx] = { ...attempts[idx], total, correct, score, duration_sec: durationSec, finished_at: now };
  }
  write(KEY_ATTEMPTS, attempts);

  return { total, correct, score, results };
}

export function removeWrongQuestion(questionId: string): boolean {
  const wrong = read<Record<string, unknown>>(KEY_WRONG, {});
  if (questionId in wrong) {
    delete wrong[questionId];
    write(KEY_WRONG, wrong);
    return true;
  }
  return false;
}

// ============= 统计 =============

export function getStats() {
  const qs = getQuestions();
  const answersStore = read<Record<string, { isCorrect: boolean }>>(KEY_ANSWERS, {});
  const wrong = read<Record<string, { wrongCount: number; streak: number; mastered: number }>>(KEY_WRONG, {});
  const attempts = read<AttemptRecord[]>(KEY_ATTEMPTS, []).filter(a => a.finished_at);

  const totalAnswers = Object.keys(answersStore).length;
  const totalCorrect = Object.values(answersStore).filter(a => a.isCorrect).length;
  const wrongCount = Object.values(wrong).filter(w => w.mastered !== 1).length;
  const masteredCount = Object.values(wrong).filter(w => w.mastered === 1).length;

  // 分类正确率
  const catStat = new Map<string, { total: number; correct: number }>();
  for (const [qid, a] of Object.entries(answersStore)) {
    const q = qs.find(x => x.id === qid);
    if (!q) continue;
    const s = catStat.get(q.category) || { total: 0, correct: 0 };
    s.total += 1;
    if (a.isCorrect) s.correct += 1;
    catStat.set(q.category, s);
  }

  return {
    totalQuestions: qs.length,
    totalAttempts: attempts.length,
    totalAnswers,
    totalCorrect,
    accuracy: totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 1000) / 10 : 0,
    wrongCount,
    masteredCount,
    recentAttempts: attempts.slice(-10),
    categoryAccuracy: [...catStat.entries()].map(([name, s]) => ({ name, ...s })).sort((a, b) => b.total - a.total),
  };
}
