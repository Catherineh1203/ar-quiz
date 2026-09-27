import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button, Tag, Input, Select, Tabs, Dialog, MessagePlugin,
  Pagination, Empty,
} from 'tdesign-react';
import {
  UploadIcon, DeleteIcon, PlayIcon, RefreshIcon,
  BookIcon, ErrorIcon, ChartIcon, EducationIcon,
} from 'tdesign-icons-react';
import { QuizQuestion, QUIZ_TYPE_LABELS, QuizTab } from '../../types';
import {
  useQuizMeta, useQuizStats, useQuizImport, startAttempt,
  fetchQuestions, fetchWrongQuestions, removeWrongQuestion, clearQuestions,
} from '../../hooks/useQuiz';
import { QuizRunner } from './QuizRunner';

const { TabPanel } = Tabs;

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>{label}</div>
      <div className="text-2xl font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--td-text-color-placeholder)' }}>{sub}</div>}
    </div>
  );
}

export function QuizPage() {
  const [tab, setTab] = useState<QuizTab>('quiz');
  const { meta, fetchMeta } = useQuizMeta();
  const { stats, fetchStats } = useQuizStats();
  const { importing, importFile } = useQuizImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 测验配置
  const [quizMode, setQuizMode] = useState<'practice' | 'exam'>('practice');
  const [quizCount, setQuizCount] = useState(10);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  // 进行中的测验
  const [attempt, setAttempt] = useState<{ attemptId: string; mode: string; questions: QuizQuestion[] } | null>(null);

  // 题库浏览
  const [bankQuestions, setBankQuestions] = useState<QuizQuestion[]>([]);
  const [bankTotal, setBankTotal] = useState(0);
  const [bankPage, setBankPage] = useState(1);
  const [bankSearch, setBankSearch] = useState('');
  const [bankCategory, setBankCategory] = useState('all');
  const [bankType, setBankType] = useState('all');
  const [bankLoading, setBankLoading] = useState(false);
  const [clearDialogVisible, setClearDialogVisible] = useState(false);

  // 错题本
  const [wrongQuestions, setWrongQuestions] = useState<QuizQuestion[]>([]);
  const [wrongLoading, setWrongLoading] = useState(false);

  const refreshAll = useCallback(() => {
    fetchMeta();
    fetchStats();
  }, [fetchMeta, fetchStats]);

  const loadBank = useCallback(async () => {
    setBankLoading(true);
    try {
      const data = await fetchQuestions({
        search: bankSearch, category: bankCategory, type: bankType,
        page: bankPage, pageSize: 20,
      });
      setBankQuestions(data.questions);
      setBankTotal(data.total);
    } catch (e: any) {
      MessagePlugin.error(e?.message || '获取题目失败');
    } finally {
      setBankLoading(false);
    }
  }, [bankSearch, bankCategory, bankType, bankPage]);

  const loadWrong = useCallback(async () => {
    setWrongLoading(true);
    try {
      const data = await fetchWrongQuestions(false);
      setWrongQuestions(data.questions);
    } catch (e: any) {
      console.error(e);
    } finally {
      setWrongLoading(false);
    }
  }, []);

  useEffect(() => { loadBank(); }, [loadBank]);
  useEffect(() => { if (tab === 'wrong') loadWrong(); }, [tab, loadWrong]);

  // 文件导入
  const handleFile = useCallback(async (file: File) => {
    try {
      const r = await importFile(file);
      MessagePlugin.success(`导入成功：${r.imported} 题${r.skipped > 0 ? `（跳过 ${r.skipped} 行）` : ''}`);
      if (r.errors.length > 0) {
        console.log('导入警告:', r.errors);
      }
      refreshAll();
      setBankPage(1);
      loadBank();
    } catch (e: any) {
      MessagePlugin.error(e?.message || '导入失败');
    }
  }, [importFile, refreshAll, loadBank]);

  const handleStartQuiz = useCallback(async () => {
    setStarting(true);
    try {
      const r = await startAttempt({ mode: quizMode, count: quizCount, categories: selectedCategories });
      setAttempt(r);
    } catch (e: any) {
      MessagePlugin.error(e?.message || '开始测验失败');
    } finally {
      setStarting(false);
    }
  }, [quizMode, quizCount, selectedCategories]);

  const handleStartWrongQuiz = useCallback(async () => {
    setStarting(true);
    try {
      const r = await startAttempt({ mode: 'wrong', count: 100 });
      setAttempt(r);
    } catch (e: any) {
      MessagePlugin.error(e?.message || '开始测验失败');
    } finally {
      setStarting(false);
    }
  }, []);

  const handleExitRunner = useCallback((backToBank: boolean) => {
    setAttempt(null);
    refreshAll();
    loadBank();
    if (tab === 'wrong') loadWrong();
    if (backToBank) setTab('quiz');
  }, [refreshAll, loadBank, loadWrong, tab]);

  // 进行中的测验：全屏答题
  if (attempt) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <QuizRunner
          attemptId={attempt.attemptId}
          mode={(attempt.mode as 'practice' | 'exam' | 'wrong')}
          questions={attempt.questions}
          onExit={handleExitRunner}
        />
      </div>
    );
  }

  const totalQuestions = meta?.categories.reduce((s, c) => s + c.count, 0) ?? 0;
  const hasBank = totalQuestions > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6">
        <Tabs value={tab} onChange={(v: any) => setTab(v as QuizTab)}>
          {/* ============= 测验 Tab ============= */}
          <TabPanel value="quiz" label={
            <span className="flex items-center gap-1.5"><EducationIcon size={16} />模拟测验</span>
          }>
            <div className="py-6 space-y-5">
              {/* 统计卡片 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="题库总题数" value={stats?.totalQuestions ?? 0} />
                <StatCard label="已做题目" value={stats?.totalAnswers ?? 0} />
                <StatCard label="总正确率" value={`${stats?.accuracy ?? 0}%`} />
                <StatCard label="待消灭错题" value={stats?.wrongCount ?? 0} />
              </div>

              {!hasBank ? (
                <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
                  <BookIcon size={48} className="mb-4" style={{ color: 'var(--td-text-color-placeholder)' }} />
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--td-text-color-primary)' }}>题库还是空的</h3>
                  <p className="text-sm mb-5" style={{ color: 'var(--td-text-color-secondary)' }}>
                    上传你的 Excel 题库文件（支持 .xlsx / .xls / .csv），<br />
                    自动识别「题干 / 选项 / 答案 / 解析 / 分类」列
                  </p>
                  <Button
                    theme="primary"
                    size="large"
                    icon={<UploadIcon />}
                    loading={importing}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    导入 Excel 题库
                  </Button>
                </div>
              ) : (
                <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
                  <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--td-text-color-primary)' }}>
                    开始新一轮练习
                  </h3>

                  <div className="space-y-4">
                    {/* 模式 */}
                    <div>
                      <div className="text-sm mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>练习模式</div>
                      <div className="flex gap-3 flex-wrap">
                        {([
                          { key: 'practice', title: '顺序练习', desc: '边做边看对错和解析' },
                          { key: 'exam', title: '模拟考试', desc: '随机抽题，交卷后统一判分' },
                        ] as const).map(m => (
                          <button
                            key={m.key}
                            onClick={() => setQuizMode(m.key)}
                            className="rounded-xl border-2 p-3 text-left w-56 transition-colors"
                            style={{
                              borderColor: quizMode === m.key ? 'var(--td-brand-color)' : 'var(--td-component-border)',
                              backgroundColor: quizMode === m.key ? 'var(--td-brand-color-light)' : 'transparent',
                            }}
                          >
                            <div className="font-medium text-sm mb-0.5" style={{ color: 'var(--td-text-color-primary)' }}>{m.title}</div>
                            <div className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>{m.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 题数 */}
                    <div>
                      <div className="text-sm mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>题目数量</div>
                      <div className="flex gap-2 flex-wrap">
                        {[5, 10, 20, 50, 100, 'all'].map(n => {
                          const isAll = n === 'all';
                          const selected = isAll ? quizCount === 0 : quizCount === n;
                          return (
                            <button
                              key={String(n)}
                              onClick={() => setQuizCount(isAll ? 0 : (n as number))}
                              className="rounded-lg border px-4 py-1.5 text-sm transition-colors"
                              style={{
                                borderColor: selected ? 'var(--td-brand-color)' : 'var(--td-component-border)',
                                color: selected ? 'var(--td-brand-color)' : 'var(--td-text-color-secondary)',
                                backgroundColor: selected ? 'var(--td-brand-color-light)' : 'transparent',
                              }}
                            >
                              {isAll ? `全部（${totalQuestions}）` : `${n} 题`}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 分类 */}
                    <div>
                      <div className="text-sm mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>
                        分类筛选（不选则全部）
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {meta?.categories.map(c => (
                          <button
                            key={c.name}
                            onClick={() => setSelectedCategories(prev =>
                              prev.includes(c.name) ? prev.filter(x => x !== c.name) : [...prev, c.name]
                            )}
                            className="rounded-full border px-3.5 py-1 text-sm transition-colors"
                            style={{
                              borderColor: selectedCategories.includes(c.name) ? 'var(--td-brand-color)' : 'var(--td-component-border)',
                              color: selectedCategories.includes(c.name) ? 'var(--td-brand-color)' : 'var(--td-text-color-secondary)',
                              backgroundColor: selectedCategories.includes(c.name) ? 'var(--td-brand-color-light)' : 'transparent',
                            }}
                          >
                            {c.name}（{c.count}）
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        theme="primary"
                        size="large"
                        icon={<PlayIcon />}
                        loading={starting}
                        onClick={handleStartQuiz}
                      >
                        开始{quizMode === 'practice' ? '练习' : '考试'}（{quizCount === 0 ? `全部 ${totalQuestions} 题` : `${quizCount} 题`}）
                      </Button>
                      {stats && stats.wrongCount > 0 && (
                        <Button size="large" variant="outline" icon={<ErrorIcon />} onClick={handleStartWrongQuiz} loading={starting}>
                          专练错题（{stats.wrongCount}）
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 最近成绩 */}
              {stats && stats.recentAttempts.length > 0 && (
                <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
                  <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--td-text-color-primary)' }}>最近成绩</h3>
                  <div className="space-y-2">
                    {stats.recentAttempts.slice().reverse().slice(-8).map(a => (
                      <div key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0" style={{ borderColor: 'var(--td-component-stroke)' }}>
                        <span style={{ color: 'var(--td-text-color-secondary)' }}>
                          {a.mode === 'practice' ? '顺序练习' : a.mode === 'exam' ? '模拟考试' : '错题专练'}
                          <span className="ml-2 text-xs">{new Date(a.finished_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </span>
                        <span style={{ color: 'var(--td-text-color-primary)' }}>
                          {a.correct}/{a.total}
                          <span className="ml-2 font-semibold" style={{ color: a.score >= 80 ? 'var(--td-success-color)' : a.score >= 60 ? 'var(--td-warning-color)' : 'var(--td-error-color)' }}>
                            {a.score}分
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabPanel>

          {/* ============= 题库 Tab ============= */}
          <TabPanel value="bank" label={
            <span className="flex items-center gap-1.5"><BookIcon size={16} />题库管理</span>
          }>
            <div className="py-6 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
                <Button theme="primary" icon={<UploadIcon />} loading={importing} onClick={() => fileInputRef.current?.click()}>
                  导入 Excel
                </Button>
                <Input
                  placeholder="搜索题干/解析"
                  clearable
                  value={bankSearch}
                  onChange={(v: any) => { setBankSearch(String(v)); setBankPage(1); }}
                  style={{ width: 220 }}
                />
                <Select
                  value={bankCategory}
                  onChange={(v: any) => { setBankCategory(String(v)); setBankPage(1); }}
                  style={{ width: 180 }}
                  clearable={false}
                  options={[
                    { label: '全部分类', value: 'all' },
                    ...(meta?.categories.map(c => ({ label: `${c.name}（${c.count}）`, value: c.name })) ?? []),
                  ]}
                />
                <Select
                  value={bankType}
                  onChange={(v: any) => { setBankType(String(v)); setBankPage(1); }}
                  style={{ width: 130 }}
                  clearable={false}
                  options={[
                    { label: '全部题型', value: 'all' },
                    ...(['single', 'multiple', 'judge', 'short'] as const).map(t => ({
                      label: QUIZ_TYPE_LABELS[t],
                      value: t,
                    })),
                  ]}
                />
                <div className="flex-1" />
                <Button
                  variant="outline"
                  theme="danger"
                  icon={<DeleteIcon />}
                  onClick={() => setClearDialogVisible(true)}
                >
                  清空题库
                </Button>
              </div>

              {bankLoading ? (
                <div className="py-20 text-center text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>加载中…</div>
              ) : bankQuestions.length === 0 ? (
                <Empty description="暂无题目，点击「导入 Excel」上传题库" />
              ) : (
                <>
                  <div className="space-y-2">
                    {bankQuestions.map(q => (
                      <div key={q.id} className="rounded-xl p-4" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <Tag theme="primary" variant="light" size="small">{QUIZ_TYPE_LABELS[q.type]}</Tag>
                              {q.category && <Tag size="small" variant="outline">{q.category}</Tag>}
                              {q.subcategory && <Tag size="small" variant="outline">{q.subcategory}</Tag>}
                              {q.difficulty && <Tag size="small" variant="outline">{q.difficulty}</Tag>}
                            </div>
                            <div className="text-sm font-medium mb-1.5" style={{ color: 'var(--td-text-color-primary)' }}>{q.question}</div>
                            {q.options && (
                              <div className="grid md:grid-cols-2 gap-x-4 gap-y-1 mb-1.5">
                                {Object.entries(q.options).map(([k, v]) => (
                                  <div key={k} className="text-xs flex items-start gap-1" style={{ color: q.answer.includes(k) ? 'var(--td-success-color)' : 'var(--td-text-color-secondary)' }}>
                                    <span className="font-medium">{k}.</span>
                                    <span className={q.answer.includes(k) ? 'font-medium' : ''}>{v}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                              答案：<span style={{ color: 'var(--td-success-color)' }} className="font-medium">{q.answer}</span>
                              {q.analysis && <span className="ml-3">解析：{q.analysis}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center">
                    <Pagination
                      total={bankTotal}
                      current={bankPage}
                      pageSize={20}
                      onChange={(p: any) => setBankPage(Number(p))}
                    />
                  </div>
                </>
              )}
            </div>
          </TabPanel>

          {/* ============= 错题本 Tab ============= */}
          <TabPanel value="wrong" label={
            <span className="flex items-center gap-1.5">
              <ErrorIcon size={16} />错题本
              {stats && stats.wrongCount > 0 && (
                <Tag theme="danger" size="small">{stats.wrongCount}</Tag>
              )}
            </span>
          }>
            <div className="py-6 space-y-4">
              <div className="flex items-center gap-3">
                <Button theme="primary" icon={<PlayIcon />} onClick={handleStartWrongQuiz} loading={starting} disabled={wrongQuestions.length === 0}>
                  开始错题专练
                </Button>
                <Button variant="outline" icon={<RefreshIcon />} onClick={loadWrong}>刷新</Button>
                <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                  答对 2 次自动移出错题本；已消灭 {stats?.masteredCount ?? 0} 题
                </span>
              </div>

              {wrongLoading ? (
                <div className="py-20 text-center text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>加载中…</div>
              ) : wrongQuestions.length === 0 ? (
                <Empty description="错题本是空的，太棒了！" />
              ) : (
                <div className="space-y-2">
                  {wrongQuestions.map(q => (
                    <div key={q.id} className="rounded-xl p-4" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Tag theme="danger" variant="light" size="small">错过 {(q as any).wrong_count} 次</Tag>
                            <Tag theme="primary" variant="light" size="small">{QUIZ_TYPE_LABELS[q.type]}</Tag>
                            {q.subcategory && <Tag size="small" variant="outline">{q.subcategory}</Tag>}
                          </div>
                          <div className="text-sm font-medium mb-1.5" style={{ color: 'var(--td-text-color-primary)' }}>{q.question}</div>
                          {q.options && (
                            <div className="grid md:grid-cols-2 gap-x-4 gap-y-1 mb-1.5">
                              {Object.entries(q.options).map(([k, v]) => (
                                <div key={k} className="text-xs flex items-start gap-1" style={{ color: q.answer.includes(k) ? 'var(--td-success-color)' : 'var(--td-text-color-secondary)' }}>
                                  <span className="font-medium">{k}.</span>
                                  <span>{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                            正确答案：<span style={{ color: 'var(--td-success-color)' }} className="font-medium">{q.answer}</span>
                            {q.analysis && <span className="ml-3">解析：{q.analysis}</span>}
                          </div>
                        </div>
                        <Button
                          size="small"
                          variant="text"
                          theme="danger"
                          onClick={async () => {
                            try {
                              await removeWrongQuestion(q.id);
                              setWrongQuestions(prev => prev.filter(x => x.id !== q.id));
                              refreshAll();
                            } catch (e: any) {
                              MessagePlugin.error(e?.message || '删除失败');
                            }
                          }}
                        >
                          移除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabPanel>

          {/* ============= 统计 Tab ============= */}
          <TabPanel value="stats" label={
            <span className="flex items-center gap-1.5"><ChartIcon size={16} />学习统计</span>
          }>
            <div className="py-6 space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="题库总题数" value={stats?.totalQuestions ?? 0} />
                <StatCard label="完成测验次数" value={stats?.totalAttempts ?? 0} />
                <StatCard label="累计做题" value={stats?.totalAnswers ?? 0} />
                <StatCard label="总正确率" value={`${stats?.accuracy ?? 0}%`} />
                <StatCard label="已消灭错题" value={stats?.masteredCount ?? 0} />
              </div>

              {stats && stats.categoryAccuracy.length > 0 && (
                <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
                  <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--td-text-color-primary)' }}>分类正确率</h3>
                  <div className="space-y-3">
                    {stats.categoryAccuracy.map(c => {
                      const pct = c.total > 0 ? Math.round((c.correct / c.total) * 100) : 0;
                      return (
                        <div key={c.name}>
                          <div className="flex justify-between text-sm mb-1">
                            <span style={{ color: 'var(--td-text-color-primary)' }}>{c.name}</span>
                            <span style={{ color: 'var(--td-text-color-secondary)' }}>{c.correct}/{c.total}（{pct}%）</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--td-bg-color-component)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: pct >= 80 ? 'var(--td-success-color)' : pct >= 60 ? 'var(--td-warning-color)' : 'var(--td-error-color)',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {stats && stats.recentAttempts.length > 0 && (
                <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
                  <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--td-text-color-primary)' }}>成绩走势</h3>
                  <div className="flex items-end gap-2 h-40">
                    {stats.recentAttempts.map(a => (
                      <div key={a.id} className="flex-1 flex flex-col items-center gap-1 group">
                        <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--td-text-color-secondary)' }}>{a.score}分</span>
                        <div
                          className="w-full rounded-t-md transition-all"
                          style={{
                            height: `${Math.max(4, a.score)}%`,
                            backgroundColor: a.score >= 80 ? 'var(--td-success-color)' : a.score >= 60 ? 'var(--td-warning-color)' : 'var(--td-error-color)',
                          }}
                        />
                        <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          {new Date(a.finished_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats && stats.recentAttempts.length === 0 && (
                <Empty description="还没有测验记录，先去做一轮练习吧" />
              )}
            </div>
          </TabPanel>
        </Tabs>
      </div>

      {/* 清空题库确认框 */}
      <Dialog
        header="清空题库"
        visible={clearDialogVisible}
        confirmBtn={{ content: '确认清空', theme: 'danger' }}
        cancelBtn="取消"
        onConfirm={async () => {
          try {
            const r = await clearQuestions('all');
            MessagePlugin.success(`已清空 ${r.deleted} 道题`);
            setClearDialogVisible(false);
            refreshAll();
            setBankPage(1);
            loadBank();
          } catch (e: any) {
            MessagePlugin.error(e?.message || '清空失败');
          }
        }}
        onClose={() => setClearDialogVisible(false)}
      >
        <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
          将删除全部题目、作答记录和错题本数据，此操作不可恢复。确定继续吗？
        </p>
      </Dialog>
    </div>
  );
}
