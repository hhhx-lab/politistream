import React, { useState } from 'react';
import { Bot, Database, Gauge, Link, Play, Send, Workflow } from 'lucide-react';
import { AgentDispatchResponse, ResearchBudget, ResearchJobSummary, ResearchRunSummary } from '../types';
import { Language } from '../i18n';

interface AgentConsoleProps {
  language: Language;
  onResearchQueued?: (jobId: string) => void;
}

const text = {
  zh: {
    title: 'Agent 调度台',
    subtitle: '自然语言入口',
    placeholder: '例如：调研过去一个月 AI 文档转换工具，抓官网、GitHub、npm/PyPI、Kaggle 数据，并生成可视化报告',
    execute: '立即执行',
    plan: '只规划',
    send: '发送',
    running: '分派中',
    seedUrls: '种子 URL',
    seedPlaceholder: '每行一个 URL，可选',
    dataRows: '数据行 JSON',
    dataPlaceholder: '[{"source":"Reuters","count":12},{"source":"AP","count":8}]',
    budget: '研究预算',
    quick: '快速',
    standard: '标准',
    deep: '深度',
    tasks: '任务计划',
    result: '执行结果',
    error: '执行失败',
    empty: '输入需求后，Agent 会分派爬虫、数据处理或可视化任务。',
  },
  en: {
    title: 'Agent Console',
    subtitle: 'Natural language router',
    placeholder: 'Example: research AI document conversion tools this month, crawl official sites, GitHub, npm/PyPI, Kaggle data, and build charts',
    execute: 'Execute',
    plan: 'Plan only',
    send: 'Send',
    running: 'Routing',
    seedUrls: 'Seed URLs',
    seedPlaceholder: 'One URL per line, optional',
    dataRows: 'JSON rows',
    dataPlaceholder: '[{"source":"Reuters","count":12},{"source":"AP","count":8}]',
    budget: 'Research budget',
    quick: 'Quick',
    standard: 'Standard',
    deep: 'Deep',
    tasks: 'Task plan',
    result: 'Execution result',
    error: 'Execution failed',
    empty: 'Enter a request and the agent will route crawler, analytics, or visualization tasks.',
  },
} as const;

type AgentBudgetMode = 'quick' | 'standard' | 'deep';

const AGENT_BUDGETS: Record<AgentBudgetMode, Partial<ResearchBudget>> = {
  quick: { maxDepth: 1, maxUrlsPerRun: 30, maxDomainsPerRun: 10 },
  standard: { maxDepth: 2, maxUrlsPerRun: 150, maxDomainsPerRun: 40 },
  deep: { maxDepth: 3, maxUrlsPerRun: 500, maxDomainsPerRun: 100 },
};

export const AgentConsole: React.FC<AgentConsoleProps> = ({ language, onResearchQueued }) => {
  const copy = text[language];
  const [message, setMessage] = useState('');
  const [execute, setExecute] = useState(true);
  const [seedUrlsText, setSeedUrlsText] = useState('');
  const [dataRowsText, setDataRowsText] = useState('');
  const [budgetMode, setBudgetMode] = useState<AgentBudgetMode>('standard');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AgentDispatchResponse | null>(null);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError('');
    try {
      const dataRows = parseOptionalRows(dataRowsText);
      const res = await fetch('/api/agent/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          execute,
          seedUrls: parseSeedUrls(seedUrlsText),
          budget: AGENT_BUDGETS[budgetMode],
          ...(dataRows ? { dataRows } : {}),
        }),
      });
      const data = await res.json() as AgentDispatchResponse;
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResponse(data);
      const queued = findQueuedResearch(data);
      if (queued?.job?.id) onResearchQueued?.(queued.job.id);
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : String(dispatchError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#E4E3E0]">
      <div className="max-w-6xl mx-auto p-6 lg:p-10 space-y-5">
        <header className="border-b border-[#141414] pb-5">
          <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-3">{copy.subtitle}</div>
          <h1 className="font-serif text-5xl leading-none flex items-center gap-3">
            <Bot size={36} />
            {copy.title}
          </h1>
        </header>

        <section className="border border-[#141414] bg-[#F5F5F4]">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={copy.placeholder}
            className="w-full min-h-40 bg-transparent p-5 outline-none text-lg leading-8 resize-y"
          />
          <div className="border-t border-[#141414] grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem]">
            <div className="border-b lg:border-b-0 lg:border-r border-[#141414] p-4">
              <label className="font-mono text-[10px] uppercase opacity-50 mb-2 flex items-center gap-2">
                <Link size={13} />
                {copy.seedUrls}
              </label>
              <textarea
                value={seedUrlsText}
                onChange={(event) => setSeedUrlsText(event.target.value)}
                placeholder={copy.seedPlaceholder}
                className="w-full min-h-24 bg-white/60 border border-stone-300 p-3 text-xs font-mono outline-none"
              />
            </div>
            <div className="border-b lg:border-b-0 lg:border-r border-[#141414] p-4">
              <label className="font-mono text-[10px] uppercase opacity-50 mb-2 flex items-center gap-2">
                <Database size={13} />
                {copy.dataRows}
              </label>
              <textarea
                value={dataRowsText}
                onChange={(event) => setDataRowsText(event.target.value)}
                placeholder={copy.dataPlaceholder}
                className="w-full min-h-24 bg-white/60 border border-stone-300 p-3 text-xs font-mono outline-none"
              />
            </div>
            <div className="p-4">
              <label className="font-mono text-[10px] uppercase opacity-50 mb-2 flex items-center gap-2">
                <Gauge size={13} />
                {copy.budget}
              </label>
              <div className="border border-stone-300 bg-stone-100 p-1 grid grid-cols-3 lg:grid-cols-1 gap-1">
                {(['quick', 'standard', 'deep'] as AgentBudgetMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setBudgetMode(mode)}
                    className={`px-3 py-2 text-xs font-mono uppercase ${budgetMode === mode ? 'bg-stone-900 text-stone-100' : 'hover:bg-stone-200'}`}
                  >
                    {copy[mode]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-[#141414] flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3">
            <div className="border border-stone-300 bg-stone-100 p-1 flex w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setExecute(true)}
                className={`px-4 py-2 text-xs font-mono uppercase flex-1 sm:flex-none ${execute ? 'bg-stone-900 text-stone-100' : 'hover:bg-stone-200'}`}
              >
                {copy.execute}
              </button>
              <button
                type="button"
                onClick={() => setExecute(false)}
                className={`px-4 py-2 text-xs font-mono uppercase flex-1 sm:flex-none ${!execute ? 'bg-stone-900 text-stone-100' : 'hover:bg-stone-200'}`}
              >
                {copy.plan}
              </button>
            </div>
            <button
              onClick={submit}
              disabled={loading || !message.trim()}
              className="inline-flex items-center justify-center gap-2 bg-stone-900 text-stone-100 px-5 py-3 text-xs font-mono uppercase disabled:opacity-50"
            >
              {loading ? <Play size={16} className="animate-pulse" /> : <Send size={16} />}
              {loading ? copy.running : copy.send}
            </button>
          </div>
        </section>

        {error && (
          <section className="border border-rose-300 bg-rose-50 p-4">
            <div className="font-mono text-xs uppercase text-rose-700 mb-2">{copy.error}</div>
            <p className="text-sm text-rose-800">{error}</p>
          </section>
        )}

        {response ? (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_24rem] gap-5">
            <section className="border border-stone-300 bg-stone-100 p-4 min-w-0">
              <h2 className="font-serif italic text-xl mb-3 flex items-center gap-2">
                <Workflow size={18} />
                {copy.tasks}
              </h2>
              <p className="text-sm leading-6 mb-4">{response.plan.answer}</p>
              <div className="space-y-3">
                {response.plan.tasks.map((task) => (
                  <div key={task.id} className="border border-stone-300 bg-white p-3">
                    <div className="font-mono text-[10px] uppercase opacity-50">{task.intent} / {task.method} {task.endpoint}</div>
                    <div className="font-serif text-lg mt-1">{task.title}</div>
                    <p className="text-sm leading-6 mt-1 opacity-80">{task.description}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="border border-stone-300 bg-stone-100 p-4 min-w-0">
              <h2 className="font-serif italic text-xl mb-3">{copy.result}</h2>
              <pre className="text-xs whitespace-pre-wrap overflow-auto max-h-[34rem] font-mono">
                {JSON.stringify(response.executions ?? response.plan, null, 2)}
              </pre>
            </section>
          </div>
        ) : (
          <div className="h-52 border border-dashed border-stone-400 flex items-center justify-center text-sm font-mono opacity-50">
            {copy.empty}
          </div>
        )}
      </div>
    </div>
  );
};

function findQueuedResearch(response: AgentDispatchResponse): { job?: ResearchJobSummary; run?: ResearchRunSummary } | undefined {
  return (response.executions ?? []).find((execution: any) => execution?.queued && execution?.job?.id) as any;
}

function parseSeedUrls(value: string) {
  return value
    .split(/[\n,\s]+/)
    .map((url) => url.trim())
    .filter((url) => url.startsWith('http://') || url.startsWith('https://'));
}

function parseOptionalRows(value: string): Array<Record<string, unknown>> | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed);
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  if (!Array.isArray(rows)) throw new Error('dataRows must be a JSON array');
  return rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
}
