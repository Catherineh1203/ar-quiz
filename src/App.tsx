import { useEffect, useState } from 'react';
import { Switch } from 'tdesign-react';
import { GraduationCap } from 'lucide-react';
import { QuizPage } from './components/quiz/QuizPage';

export default function App() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('theme-mode', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: 'var(--td-bg-color-page)',
        color: 'var(--td-text-color-primary)',
        transition: 'background-color .3s',
      }}
    >
      {/* 顶部标题栏 */}
      <header
        className="sticky top-0 z-10 px-4 md:px-6 py-3 flex items-center justify-between border-b backdrop-blur"
        style={{
          borderColor: 'var(--td-component-stroke)',
          backgroundColor: 'var(--td-bg-color-page)',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--td-brand-color)' }}
          >
            <GraduationCap size={18} color="#fff" />
          </div>
          <div>
            <div className="font-semibold text-base leading-tight">A&amp;R 模拟题库</div>
            <div className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
              刷题 · 错题本 · 学习统计
            </div>
          </div>
        </div>
        <Switch
          value={dark}
          label={['🌙', '☀️']}
          onChange={(v: any) => setDark(Boolean(v))}
        />
      </header>

      <main className="flex-1 flex flex-col">
        <QuizPage />
      </main>

      <footer
        className="py-3 text-center text-xs"
        style={{ color: 'var(--td-text-color-placeholder)' }}
      >
        学习记录保存在本机浏览器中 · 清除浏览器数据会丢失记录
      </footer>
    </div>
  );
}
