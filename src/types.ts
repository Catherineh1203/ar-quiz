// ============= 题库相关类型 =============

export type QuizQuestionType = 'single' | 'multiple' | 'judge' | 'short';

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  category: string;
  subcategory: string;
  question: string;
  options: Record<string, string> | null;
  answer: string;
  analysis: string;
  difficulty: string;
  wrong_count?: number;
  streak?: number;
  mastered?: number;
}

export const QUIZ_TYPE_LABELS: Record<QuizQuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  short: '简答题',
};

export interface QuizMeta {
  categories: Array<{ name: string; count: number }>;
  types: Array<{ type: QuizQuestionType; count: number }>;
}

export interface QuizStats {
  totalQuestions: number;
  totalAttempts: number;
  totalAnswers: number;
  totalCorrect: number;
  accuracy: number;
  wrongCount: number;
  masteredCount: number;
  recentAttempts: Array<{
    id: string;
    mode: string;
    total: number;
    correct: number;
    score: number;
    duration_sec: number;
    finished_at: string;
  }>;
  categoryAccuracy: Array<{ name: string; total: number; correct: number }>;
}

export interface SubmitResult {
  total: number;
  correct: number;
  score: number;
  results: Array<{
    questionId: string;
    isCorrect: boolean;
    correctAnswer: string;
    userAnswer: string | null;
  }>;
}

export type QuizTab = 'bank' | 'quiz' | 'wrong' | 'stats';
