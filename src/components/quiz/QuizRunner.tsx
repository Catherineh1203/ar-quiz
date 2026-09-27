import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Button, Tag, Progress, Radio, Checkbox, Textarea, MessagePlugin,
} from 'tdesign-react';
import {
  CheckCircleIcon, CloseCircleIcon, ChevronLeftIcon, ChevronRightIcon,
  RefreshIcon, HomeIcon, EducationIcon,
} from 'tdesign-icons-react';
import { Bot } from 'lucide-react';
import { QuizQuestion, QUIZ_TYPE_LABELS, SubmitResult } from '../../types';
import { submitAttempt, aiExplain } from '../../hooks/useQuiz';

export interface QuizRunnerProps {
  attemptId: string;
  mode: 'practice' | 'exam' | 'wrong';
  questions: QuizQuestion[];
  onExit: (refreshAll: boolean) => void;
}

type AnswerMap = Record<string, string | null>;

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

function answerToText(a: string | null, type: string): string {
  if (!a) return '未作答';
  if (type === 'multiple') {
    return a.split('').sort().join('');
  }
  return a;
}

export function QuizRunner({ attemptId, mode, questions, onExit }: QuizRunnerProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({}); // practice: 已确认
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startTime] = useState(() => Date.now());
  const [aiText, setAiText] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);

  const q = questions[currentIdx];
  const isPractice = mode === 'practice';
  const answeredCount = useMemo(
    () => questions.filter(qq => answers[qq.id] !== undefined && answers[qq.id] !== null && answers[qq.id] !== '').length,
    [answers, questions]
  );

  const setAnswer = useCallback((value: string | null) => {
    if (!q || (isPractice && revealed[q.id])) return;
    setAnswers(prev => ({ ...prev, [q.id]: value }));
  }, [q, isPractice, revealed]);

  const toggleMulti = useCallback((letter: string) => {
    if (!q || (isPractice && revealed[q.id])) return;
    setAnswers(prev => {
      const cur = (prev[q.id] as string) || '';
      const has = cur.includes(letter);
      const next = has ? cur.replace(letter, '') : cur + letter;
      return { ...prev, [q.id]: next.split('').sort().join('') };
    });
  }, [q, isPractice, revealed]);

  // 判分（practice 即时反馈）
  const checkCorrect = useCallback((question: QuizQuestion, ans: string | null): boolean => {
    if (!ans) return false;
    if (question.type === 'multiple') {
      const u = ans.split('').sort().join('');
      const c = question.answer.split('').sort().join('');
      return u === c;
    }
    if (question.type === 'short') {
      return ans.trim().includes(question.answer.trim()) || question.answer.trim().includes(ans.trim());
    }
    return ans.trim().toUpperCase() === question.answer.trim().toUpperCase();
  }, []);

  const confirmCurrent = useCallback(() => {
    if (!q) return;
    setRevealed(prev => ({ ...prev, [q.id]: true }));
  }, [q]);

  const goNext = useCallback(() => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      finishQuiz();
    }
  }, [currentIdx, questions.length]);

  const finishQuiz = useCallback(async () => {
    if (submitting || finished) return;
    setSubmitting(true);
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    try {
      const r = await submitAttempt(
        attemptId,
        questions.map(qq => ({ questionId: qq.id, userAnswer: (answers[qq.id] as string) ?? null })),
        durationSec
      );
      setResult(r);
      setFinished(true);
      setReviewIdx(0);
    } catch (e: any) {
      MessagePlugin.error(e?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, finished, answers, attemptId, questions, startTime]);

  const loadAiExplain = useCallback(async (question: QuizQuestion) => {
    if (aiLoading) return;
    setAiLoading(question.id);
    try {
      const text = await aiExplain({
        question: question.question,
        options: question.options,
        answer: question.answer,
        analysis: question.analysis,
        userAnswer: answers[question.id] ?? null,
      });
      setAiText(prev => ({ ...prev, [question.id]: text }));
    } catch (e: any) {
      MessagePlugin.error(e?.message || 'AI 讲解失败');
    } finally {
      setAiLoading(null);
    }
  }, [aiLoading, answers]);

  // ============= 结果页 =============
  if (finished && result) {
    const wrongQuestions = questions.filter(qq => {
      const r = result.results.find(rr => rr.questionId === qq.id);
      return r && !r.isCorrect;
    });
    const rq = wrongQuestions[reviewIdx];
    return (
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <div className="rounded-2xl p-8 text-center mb-6" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
          <div className="text-5xl font-bold mb-2" style={{ color: result.score >= 80 ? 'var(--td-success-color)' : result.score >= 60 ? 'var(--td-warning-color)' : 'var(--td-error-color)' }}>
            {result.score}
            <span className="text-lg font-normal">分</span>
          </div>
          <div className="text-sm mb-4" style={{ color: 'var(--td-text-color-secondary)' }}>
            答对 {result.correct} / {result.total} 题 · 用时 {formatDuration(Math.round((Date.now() - startTime) / 1000))}
          </div>
          <div className="flex justify-center gap-3">
            <Button variant="outline" icon={<HomeIcon />} onClick={() => onExit(true)}>返回题库</Button>
            <Button theme="primary" icon={<RefreshIcon />} onClick={() => onExit(false)}>再练一次</Button>
          </div>
        </div>

        {wrongQuestions.length > 0 ? (
          <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
                错题回顾（{wrongQuestions.length} 题）
              </h3>
              <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>{reviewIdx + 1} / {wrongQuestions.length}</span>
            </div>
            {rq && (
              <div>
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <Tag theme="primary" variant="light" size="small">{QUIZ_TYPE_LABELS[rq.type]}</Tag>
                  {rq.subcategory && <Tag size="small" variant="outline">{rq.subcategory}</Tag>}
                  {rq.difficulty && <Tag size="small" variant="outline">{rq.difficulty}</Tag>}
                </div>
                <p className="mb-3 font-medium" style={{ color: 'var(--td-text-color-primary)' }}>{rq.question}</p>
                {rq.options && (
                  <div className="space-y-1.5 mb-3">
                    {Object.entries(rq.options).map(([k, v]) => (
                      <div key={k} className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>{k}. {v}</div>
                    ))}
                  </div>
                )}
                <div className="text-sm mb-1">
                  <span style={{ color: 'var(--td-error-color)' }}>你的答案：{answerToText((answers[rq.id] as string) ?? null, rq.type)}</span>
                </div>
                <div className="text-sm mb-3">
                  <span style={{ color: 'var(--td-success-color)' }}>正确答案：{rq.answer}</span>
                </div>
                {rq.analysis && (
                  <div className="text-sm mb-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-secondarycontainer)', color: 'var(--td-text-color-secondary)' }}>
                    解析：{rq.analysis}
                  </div>
                )}
                {!aiText[rq.id] && (
                  <Button
                    size="small"
                    variant="outline"
                    icon={<Bot size={14} />}
                    loading={aiLoading === rq.id}
                    onClick={() => loadAiExplain(rq)}
                  >
                    AI 老师讲解
                  </Button>
                )}
                {aiText[rq.id] && (
                  <div className="p-4 rounded-lg text-sm whitespace-pre-wrap leading-relaxed" style={{ backgroundColor: 'var(--td-brand-color-light)', color: 'var(--td-text-color-primary)' }}>
                    {aiText[rq.id]}
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between mt-4">
              <Button variant="outline" disabled={reviewIdx === 0} onClick={() => setReviewIdx(reviewIdx - 1)}>上一题</Button>
              {reviewIdx < wrongQuestions.length - 1 && (
                <Button variant="outline" onClick={() => setReviewIdx(reviewIdx + 1)}>下一题</Button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'var(--td-bg-color-container)', color: 'var(--td-text-color-secondary)' }}>
            全部答对，太棒了！🎉
          </div>
        )}
      </div>
    );
  }

  // ============= 答题页 =============
  if (!q) return null;

  const myAnswer = answers[q.id] as string | null;
  const isRevealed = isPractice && revealed[q.id];
  const isCorrect = isRevealed ? checkCorrect(q, myAnswer) : false;
  const canNext = myAnswer !== undefined && myAnswer !== null && myAnswer !== '';
  const progress = Math.round((answeredCount / questions.length) * 100);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 顶部进度 */}
      <div className="px-6 pt-4 pb-2 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
            第 {currentIdx + 1} / {questions.length} 题 · 已作答 {answeredCount}
          </span>
          <Button size="small" variant="text" theme="default" onClick={finishQuiz} loading={submitting}>
            结束并交卷
          </Button>
        </div>
        <Progress theme="line" percentage={progress} />
      </div>

      {/* 题目卡片 */}
      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-3xl mx-auto w-full">
        <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <Tag theme="primary" variant="light" size="small">{QUIZ_TYPE_LABELS[q.type]}</Tag>
            {q.subcategory && <Tag size="small" variant="outline">{q.subcategory}</Tag>}
            {q.difficulty && <Tag size="small" variant="outline">{q.difficulty}</Tag>}
            {q.type === 'multiple' && <Tag theme="warning" size="small" variant="light">多选</Tag>}
          </div>

          <h3 className="text-lg font-medium mb-5 leading-relaxed" style={{ color: 'var(--td-text-color-primary)' }}>
            {q.question}
          </h3>

          {/* 选项/作答区 */}
          {(q.type === 'single' || q.type === 'judge') && q.options && (
            <Radio.Group value={myAnswer ?? undefined} onChange={(v: any) => setAnswer(String(v))} disabled={isRevealed}>
              <div className="space-y-2.5">
                {Object.entries(q.options).map(([k, v]) => {
                  const isRight = isRevealed && k === q.answer;
                  const isWrongPick = isRevealed && k === myAnswer && !isCorrect;
                  return (
                    <div
                      key={k}
                      className="rounded-lg border p-3 transition-colors cursor-pointer"
                      style={{
                        borderColor: isRight ? 'var(--td-success-color)' : isWrongPick ? 'var(--td-error-color)' : 'var(--td-component-border)',
                        backgroundColor: isRight ? 'var(--td-success-color-1)' : isWrongPick ? 'var(--td-error-color-1)' : 'transparent',
                      }}
                      onClick={() => !isRevealed && setAnswer(k)}
                    >
                      <Radio value={k} className="w-full">
                        <span className="text-sm">{v}</span>
                      </Radio>
                    </div>
                  );
                })}
              </div>
            </Radio.Group>
          )}

          {q.type === 'multiple' && q.options && (
            <div className="space-y-2.5">
              {Object.entries(q.options).map(([k, v]) => {
                const checked = (myAnswer || '').includes(k);
                const isRight = isRevealed && q.answer.includes(k);
                const isWrongPick = isRevealed && checked && !q.answer.includes(k);
                return (
                  <div
                    key={k}
                    className="rounded-lg border p-3 transition-colors cursor-pointer"
                    style={{
                      borderColor: isRight ? 'var(--td-success-color)' : isWrongPick ? 'var(--td-error-color)' : 'var(--td-component-border)',
                      backgroundColor: isRight ? 'var(--td-success-color-1)' : isWrongPick ? 'var(--td-error-color-1)' : 'transparent',
                    }}
                    onClick={() => toggleMulti(k)}
                  >
                    <Checkbox checked={checked} className="w-full">
                      <span className="text-sm">{v}</span>
                    </Checkbox>
                  </div>
                );
              })}
            </div>
          )}

          {q.type === 'short' && (
            <Textarea
              value={myAnswer ?? ''}
              onChange={(v: any) => setAnswer(String(v))}
              placeholder="请输入你的答案…"
              autosize={{ minRows: 3, maxRows: 6 }}
              disabled={isRevealed}
            />
          )}

          {/* 练习模式：确认后显示反馈 */}
          {isRevealed && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: isCorrect ? 'var(--td-success-color)' : 'var(--td-error-color)' }}>
                {isCorrect ? <CheckCircleIcon /> : <CloseCircleIcon />}
                {isCorrect ? '回答正确！' : `回答错误，正确答案：${q.answer}`}
              </div>
              {!isCorrect && myAnswer && (
                <div className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>你的答案：{answerToText(myAnswer, q.type)}</div>
              )}
              {q.analysis && (
                <div className="text-sm p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-secondarycontainer)', color: 'var(--td-text-color-secondary)' }}>
                  解析：{q.analysis}
                </div>
              )}
              {!aiText[q.id] && (
                <Button
                  size="small"
                  variant="outline"
                  icon={<Bot size={14} />}
                  loading={aiLoading === q.id}
                  onClick={() => loadAiExplain(q)}
                >
                  AI 老师讲解
                </Button>
              )}
              {aiText[q.id] && (
                <div className="p-4 rounded-lg text-sm whitespace-pre-wrap leading-relaxed" style={{ backgroundColor: 'var(--td-brand-color-light)', color: 'var(--td-text-color-primary)' }}>
                  {aiText[q.id]}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 题号导航 */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {questions.map((qq, i) => {
            const answered = answers[qq.id] !== undefined && answers[qq.id] !== null && answers[qq.id] !== '';
            return (
              <button
                key={qq.id}
                onClick={() => setCurrentIdx(i)}
                className="w-8 h-8 rounded-md text-xs transition-colors"
                style={{
                  backgroundColor: i === currentIdx
                    ? 'var(--td-brand-color)'
                    : answered
                      ? 'var(--td-brand-color-light)'
                      : 'var(--td-bg-color-secondarycontainer)',
                  color: i === currentIdx ? '#fff' : 'var(--td-text-color-secondary)',
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="px-6 py-4 flex items-center justify-between max-w-3xl mx-auto w-full border-t" style={{ borderColor: 'var(--td-component-border)' }}>
        <Button
          variant="outline"
          icon={<ChevronLeftIcon />}
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx(currentIdx - 1)}
        >
          上一题
        </Button>
        <div className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
          {isPractice && !isRevealed && canNext ? '选好后点击「确认答案」查看对错' : ''}
        </div>
        {isPractice && !isRevealed ? (
          <Button theme="primary" disabled={!canNext} onClick={confirmCurrent}>
            确认答案
          </Button>
        ) : (
          <Button theme="primary" icon={<ChevronRightIcon />} onClick={goNext} loading={submitting && currentIdx === questions.length - 1}>
            {currentIdx === questions.length - 1 ? '完成测验' : '下一题'}
          </Button>
        )}
      </div>
    </div>
  );
}
