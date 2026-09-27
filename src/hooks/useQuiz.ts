import { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { QuizMeta, QuizStats, QuizQuestion, SubmitResult } from '../types';
import * as engine from '../lib/quizEngine';

// ============= Meta =============

export function useQuizMeta() {
  const [meta, setMeta] = useState<QuizMeta | null>(null);

  const fetchMeta = useCallback(async () => {
    setMeta(engine.getMeta());
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  return { meta, fetchMeta };
}

// ============= Stats =============

export function useQuizStats() {
  const [stats, setStats] = useState<QuizStats | null>(null);

  const fetchStats = useCallback(async () => {
    setStats(engine.getStats() as QuizStats);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return { stats, fetchStats };
}

// ============= 导入 Excel（客户端解析） =============

export interface ImportResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

export function useQuizImport() {
  const [importing, setImporting] = useState(false);

  const importFile = useCallback(async (file: File): Promise<ImportResponse> => {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      // 用现有题库构建去重键
      const existingIds = new Set<string>();
      for (const q of engine.getQuestions()) {
        existingIds.add(q.question + '|' + q.answer);
      }
      const result = engine.importWorkbook(wb, XLSX, existingIds);
      if (result.imported === 0) {
        throw new Error('未能导入任何题目。请确保 Excel 包含「题干」「答案」列（支持列名：题型/题干/选项A-D/答案/解析/分类）');
      }
      return result;
    } finally {
      setImporting(false);
    }
  }, []);

  return { importing, importFile };
}

// ============= 测验 =============

export interface StartAttemptResponse {
  attemptId: string;
  mode: string;
  questions: QuizQuestion[];
}

export async function startAttempt(opts: {
  mode: 'practice' | 'exam' | 'wrong';
  count: number;
  categories?: string[];
}): Promise<StartAttemptResponse> {
  let questions: QuizQuestion[];
  if (opts.mode === 'wrong') {
    questions = engine.pickWrongQuestions();
  } else {
    questions = engine.pickQuestions({ count: opts.count, categories: opts.categories });
  }
  if (questions.length === 0) {
    throw new Error(opts.mode === 'wrong' ? '错题本为空，先做一次测验吧' : '没有符合条件的题目，请先导入题库或调整筛选条件');
  }
  const attemptId = engine.createAttempt(opts.mode, questions.length);
  return { attemptId, mode: opts.mode, questions };
}

export async function submitAttempt(
  attemptId: string,
  answers: Array<{ questionId: string; userAnswer: string | null }>,
  durationSec: number
): Promise<SubmitResult> {
  return engine.submitAttempt(attemptId, answers, durationSec);
}

// ============= 错题本 =============

export async function fetchWrongQuestions(includeMastered = false): Promise<{ questions: QuizQuestion[] }> {
  void includeMastered;
  return { questions: engine.pickWrongQuestions() };
}

export async function removeWrongQuestion(questionId: string): Promise<{ success: boolean }> {
  return { success: engine.removeWrongQuestion(questionId) };
}

// ============= 题库查询 =============

export async function fetchQuestions(params: {
  search?: string;
  category?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ total: number; page: number; pageSize: number; questions: QuizQuestion[] }> {
  return engine.listQuestions(params);
}

export async function clearQuestions(category?: string): Promise<{ deleted: number }> {
  void category;
  return { deleted: engine.clearQuestions() };
}

// ============= AI 讲解（离线降级：给出结构化解析） =============

export async function aiExplain(q: {
  question: string;
  options?: Record<string, string> | null;
  answer: string;
  analysis?: string;
  userAnswer?: string | null;
}): Promise<string> {
  const optionLines = q.options
    ? Object.entries(q.options).map(([k, v]) => `${k}. ${v}`).join('\n')
    : '';
  const parts = [`【答案】${q.answer}`];
  if (q.userAnswer && q.userAnswer !== q.answer) {
    parts.push(`你的答案：${q.userAnswer}`);
  }
  if (q.analysis) {
    parts.push(`【解析】${q.analysis}`);
  } else {
    parts.push('【解析】题库未附带解析。可在「AI 对话版」应用中获取 AI 老师详细讲解。');
  }
  if (optionLines) parts.push(`【选项】\n${optionLines}`);
  parts.push('（当前为离线静态版，AI 互动讲解请在电脑端打开本地完整版使用）');
  return parts.join('\n\n');
}
