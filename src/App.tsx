import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bookmark,
  Copy,
  Database,
  ExternalLink,
  Home,
  Rss,
  Search,
  Wand2,
} from 'lucide-react';
import { NewsFeed } from './components/NewsFeed';
import { RSSSourceManager } from './components/RSSSourceManager';
import { ResearchPanel } from './components/ResearchPanel';
import { createTranslator, isLanguage, Language, nextLanguage, Translator } from './i18n';
import {
  FeedSource,
  ParsedNewsItem,
  ResearchBudget,
  ResearchConfigStatus,
  ResearchJobSummary,
  ResearchRunResponse,
  RuntimeStatus,
} from './types';

type Workspace = 'home' | 'news' | 'research';
type ViewMode = 'all' | 'favorites' | 'warehouse';
type ResearchMode = 'quick' | 'standard' | 'deep';

interface ResearchSearchInput {
  topic: string;
  seedUrls: string[];
  budget: Partial<ResearchBudget>;
}

const RESEARCH_MODE_BUDGETS: Record<ResearchMode, Partial<ResearchBudget>> = {
  quick: { maxDepth: 1, maxUrlsPerRun: 30, maxDomainsPerRun: 10 },
  standard: { maxDepth: 2, maxUrlsPerRun: 150, maxDomainsPerRun: 40 },
  deep: { maxDepth: 3, maxUrlsPerRun: 500, maxDomainsPerRun: 100 },
};

function App() {
  const [selectedItem, setSelectedItem] = useState<ParsedNewsItem | null>(null);
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [workspace, setWorkspace] = useState<Workspace>('home');
  const [selectedResearchJobId, setSelectedResearchJobId] = useState<string | undefined>();
  const [analyzing, setAnalyzing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [newsRefreshToken, setNewsRefreshToken] = useState(0);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = window.localStorage.getItem('politistream-language');
    return saved && isLanguage(saved) ? saved : 'zh';
  });
  const t = createTranslator(language);

  const loadFeeds = async () => {
    try {
      const res = await fetch('/api/feeds');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFeeds(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadFeeds();
  }, []);

  useEffect(() => {
    window.localStorage.setItem('politistream-language', language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  const handleResearchSearch = async (input: ResearchSearchInput) => {
    const normalizedTopic = input.topic.trim();
    if (!normalizedTopic) {
      setSearchError(t('searchHome.emptyTopic'));
      return;
    }

    setSearching(true);
    setSearchError('');
    try {
      const createRes = await fetch('/api/research/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: normalizedTopic,
          seedUrls: input.seedUrls,
          budget: input.budget,
        }),
      });
      const job = await createRes.json() as ResearchJobSummary;
      if (!createRes.ok) throw new Error((job as any).message || (job as any).error || `HTTP ${createRes.status}`);

      setSelectedResearchJobId(job.id);
      setWorkspace('research');

      const runRes = await fetch(`/api/research/jobs/${job.id}/run`, { method: 'POST' });
      const run = await runRes.json() as ResearchRunResponse;
      if (!runRes.ok && runRes.status !== 202) {
        throw new Error((run as any).message || (run as any).error || `HTTP ${runRes.status}`);
      }
      setSelectedResearchJobId(run.job?.id ?? job.id);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  };

  const handleAnalyzeItem = async (id: number) => {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/news/${id}/analyze`, { method: 'POST' });

      if (!res.ok) {
        let errorText = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          errorText = errData.error || errorText;
        } catch (e) {
          errorText = await res.text();
        }
        throw new Error(errorText);
      }

      const data = await res.json();
      if (data.success && data.data) {
        let entities = [];
        try {
          if (typeof data.data.entities === 'string') {
            entities = JSON.parse(data.data.entities);
          } else if (Array.isArray(data.data.entities)) {
            entities = data.data.entities;
          }
        } catch (e) {}

        setSelectedItem({ ...data.data, entities });
      } else {
        setSelectedItem(prev => prev ? {
          ...prev,
          summary: `${t('article.apiError')}: ${data.error || 'Failed to analyze item'}`,
          sentiment: 0,
          entities: [],
        } : null);
      }
    } catch (e) {
      console.error(e);
      setSelectedItem(prev => prev ? {
        ...prev,
        summary: `${t('article.networkError')}: ${e instanceof Error ? e.message : String(e)}`,
        sentiment: 0,
        entities: [],
      } : null);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCopyContent = () => {
    if (!selectedItem) return;
    const text = `
${t('article.title')}: ${selectedItem.title}
${t('article.source')}: ${selectedItem.source}
${t('article.date')}: ${selectedItem.pubDate}
${t('article.link')}: ${selectedItem.link}

${t('article.summary')}:
${selectedItem.summary || 'N/A'}

${t('article.content')}:
${selectedItem.contentSnippet}
    `.trim();
    navigator.clipboard.writeText(text);
  };

  const openNews = (mode: ViewMode) => {
    setWorkspace('news');
    setViewMode(mode);
  };

  return (
    <div className="h-screen w-full bg-[#E4E3E0] text-[#141414] font-sans flex overflow-hidden">
      <aside className="w-64 border-r border-[#141414] flex flex-col bg-[#E4E3E0] flex-shrink-0">
        <div className="h-16 border-b border-[#141414] flex items-center justify-between gap-3 px-6">
          <div className="font-serif italic text-lg">PolitiStream</div>
          <button
            onClick={() => setLanguage(nextLanguage(language))}
            className="px-2 py-1 border border-stone-400 text-[10px] font-mono uppercase hover:bg-[#D4D3D0]"
            title={t('language.current')}
          >
            {t('language.toggle')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-6">
            <h3 className="text-xs font-mono uppercase tracking-widest opacity-50 mb-4 px-2">{t('nav.research')}</h3>
            <div className="space-y-2">
              <NavItem active={workspace === 'home'} icon={<Home size={16} />} label={t('nav.searchHome')} onClick={() => setWorkspace('home')} />
              <NavItem active={workspace === 'research'} icon={<Search size={16} />} label={t('nav.researchJobs')} onClick={() => setWorkspace('research')} />
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-mono uppercase tracking-widest opacity-50 mb-4 px-2">{t('nav.newsCrawler')}</h3>
            <div className="space-y-2">
              <NavItem active={workspace === 'news' && viewMode === 'all'} icon={<Rss size={16} />} label={t('nav.rssMonitoring')} onClick={() => openNews('all')} />
              <NavItem active={workspace === 'news' && viewMode === 'favorites'} icon={<Bookmark size={16} />} label={t('nav.savedLibrary')} onClick={() => openNews('favorites')} />
              <NavItem active={workspace === 'news' && viewMode === 'warehouse'} icon={<Database size={16} />} label={t('nav.aiWorkQueue')} onClick={() => openNews('warehouse')} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-mono uppercase tracking-widest opacity-50 mb-4 px-2">{t('nav.activeSources')}</h3>
            <div className="space-y-1">
              {feeds.slice(0, 12).map((feed) => (
                <button
                  key={feed.id ?? feed.url}
                  onClick={() => openNews('all')}
                  className="w-full flex items-center gap-3 px-2 py-1.5 hover:bg-[#D4D3D0] rounded group transition-colors text-left"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${feed.enabled ? 'bg-emerald-600' : 'bg-stone-400'}`} />
                  <span className="text-xs font-mono truncate opacity-70 group-hover:opacity-100 transition-opacity" title={feed.name}>
                    {feed.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[#141414] text-[10px] font-mono opacity-40 text-center">
          {t('nav.footer')}
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden">
        {workspace === 'home' && (
          <SearchHome onSearch={handleResearchSearch} loading={searching} error={searchError} t={t} />
        )}

        {workspace === 'research' && (
          <ResearchPanel
            selectedJobId={selectedResearchJobId}
            onSelectedJobChange={setSelectedResearchJobId}
            onBackToSearch={() => setWorkspace('home')}
            language={language}
            t={t}
          />
        )}

        {workspace === 'news' && (
          <div className="h-full flex min-w-0">
            {viewMode === 'all' && (
              <div className="w-80 flex-shrink-0">
                <RSSSourceManager
                  sources={feeds}
                  onSourcesChange={setFeeds}
                  onRefreshComplete={() => setNewsRefreshToken((value) => value + 1)}
                  t={t}
                />
              </div>
            )}
            <div className="w-96 border-r border-[#141414] bg-[#F5F5F4] flex flex-col flex-shrink-0">
              <NewsFeed
                key={`${viewMode}-${newsRefreshToken}`}
                onSelect={setSelectedItem}
                selectedId={selectedItem?.id}
                viewMode={viewMode}
                language={language}
                t={t}
              />
            </div>
            <ArticleDetail
              item={selectedItem}
              analyzing={analyzing}
              onAnalyze={handleAnalyzeItem}
              onCopy={handleCopyContent}
              t={t}
            />
          </div>
        )}
      </main>
    </div>
  );
}

const NavItem: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ active, icon, label, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-2 py-1.5 cursor-pointer rounded transition-colors text-left ${active ? 'bg-[#D4D3D0] opacity-100' : 'opacity-60 hover:opacity-100'}`}
  >
    {icon}
    <span className="text-sm truncate">{label}</span>
  </button>
);

const SearchHome: React.FC<{
  onSearch: (input: ResearchSearchInput) => void;
  loading: boolean;
  error: string;
  t: Translator;
}> = ({ onSearch, loading, error, t }) => {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<ResearchMode>('standard');
  const [seedUrlsText, setSeedUrlsText] = useState('');
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [researchStatus, setResearchStatus] = useState<ResearchConfigStatus | null>(null);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/runtime/status').then((res) => res.json()),
      fetch('/api/research/status').then((res) => res.json()),
    ])
      .then(([runtime, research]) => {
        if (!active) return;
        setRuntimeStatus(runtime);
        setResearchStatus(research);
        setStatusError('');
      })
      .catch((statusFetchError) => {
        if (!active) return;
        setStatusError(statusFetchError instanceof Error ? statusFetchError.message : String(statusFetchError));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-[#E4E3E0]">
      <div className="min-h-full max-w-5xl mx-auto px-6 py-14 flex flex-col justify-center">
        <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-5">{t('searchHome.eyebrow')}</div>
        <h1 className="font-serif text-5xl md:text-7xl leading-none mb-8">
          PolitiStream
        </h1>
        <form
          className="border border-[#141414] bg-[#F5F5F4] flex flex-col md:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch({
              topic,
              seedUrls: parseSeedUrls(seedUrlsText),
              budget: RESEARCH_MODE_BUDGETS[mode],
            });
          }}
        >
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={t('searchHome.placeholder')}
            className="flex-1 min-w-0 bg-transparent px-5 py-5 text-lg outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="md:w-48 flex items-center justify-center gap-2 border-t md:border-t-0 md:border-l border-[#141414] px-5 py-4 bg-stone-900 text-stone-100 disabled:opacity-50"
          >
            <Search size={18} />
            <span className="font-mono text-xs uppercase">{loading ? t('searchHome.running') : t('searchHome.submit')}</span>
          </button>
        </form>
        <div className="mt-3 grid md:grid-cols-[1fr_2fr] gap-3">
          <div className="border border-stone-300 bg-stone-100 p-1 flex">
            {(['quick', 'standard', 'deep'] as ResearchMode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`flex-1 px-3 py-2 text-xs font-mono uppercase ${mode === option ? 'bg-stone-900 text-stone-100' : 'text-stone-600 hover:bg-stone-200'}`}
              >
                {t(`searchHome.${option}`)}
              </button>
            ))}
          </div>
          <input
            value={seedUrlsText}
            onChange={(event) => setSeedUrlsText(event.target.value)}
            placeholder={t('searchHome.seedPlaceholder')}
            className="border border-stone-300 bg-stone-100 px-4 py-3 text-sm outline-none"
          />
        </div>
        {error && <p className="mt-4 text-sm font-mono text-rose-700">{error}</p>}
        <div className="grid md:grid-cols-4 gap-3 mt-8">
          <StatusTile
            label={t('status.api')}
            value={runtimeStatus?.api === 'ok' ? t('status.online') : t('status.unknown')}
            tone={runtimeStatus?.api === 'ok' ? 'good' : 'muted'}
          />
          <StatusTile
            label={t('status.researchDb')}
            value={researchStatus?.databaseConfigured ? t('status.configured') : t('status.missing')}
            tone={researchStatus?.databaseConfigured ? 'good' : 'warn'}
          />
          <StatusTile
            label={t('status.providers')}
            value={`${researchStatus?.enabledSearchProviderCount ?? 0} ${t('status.enabled')}`}
            tone={(researchStatus?.enabledSearchProviderCount ?? 0) > 0 ? 'good' : 'warn'}
          />
          <StatusTile
            label={t('status.rssStartup')}
            value={runtimeStatus?.refreshRssOnStartup ? t('status.auto') : t('status.manual')}
            tone="muted"
          />
        </div>
        {statusError && <p className="mt-3 text-xs font-mono text-rose-700">{statusError}</p>}
      </div>
    </div>
  );
};

function parseSeedUrls(value: string) {
  return value
    .split(/[\n,\s]+/)
    .map((url) => url.trim())
    .filter((url) => url.startsWith('http://') || url.startsWith('https://'));
}

const StatusTile: React.FC<{
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'muted';
}> = ({ label, value, tone }) => {
  const dot = tone === 'good' ? 'bg-emerald-600' : tone === 'warn' ? 'bg-amber-600' : 'bg-stone-500';
  return (
    <div className="border border-stone-300 bg-stone-100 p-3 min-w-0">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="font-mono text-[10px] uppercase opacity-50 truncate">{label}</span>
      </div>
      <div className="font-serif text-xl mt-2 truncate">{value}</div>
    </div>
  );
};

const ArticleDetail: React.FC<{
  item: ParsedNewsItem | null;
  analyzing: boolean;
  onAnalyze: (id: number) => void;
  onCopy: () => void;
  t: Translator;
}> = ({ item, analyzing, onAnalyze, onCopy, t }) => (
  <div className="flex-1 bg-[#E4E3E0] relative overflow-y-auto">
    <AnimatePresence mode="wait">
      {item ? (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="p-8 lg:p-12 max-w-4xl mx-auto"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
            <div className="flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-widest opacity-60">
              <span>{item.source}</span>
              <span>/</span>
              <span>{safeDate(item.pubDate)}</span>
              <span>/</span>
              <span>ID: {item.id.toString().padStart(6, '0')}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onCopy}
                className="flex items-center gap-2 px-3 py-1.5 bg-stone-200 hover:bg-stone-300 rounded transition-colors text-stone-700 text-xs font-mono uppercase tracking-wider"
                title={t('article.copyTitle')}
              >
                <Copy size={14} />
                <span>{t('article.copy')}</span>
              </button>
              <button
                onClick={() => onAnalyze(item.id)}
                disabled={analyzing}
                className="flex items-center gap-2 px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-stone-100 rounded transition-colors text-xs font-mono uppercase tracking-wider disabled:opacity-50"
                title={t('article.analyze')}
              >
                <Wand2 size={14} className={analyzing ? 'animate-spin' : ''} />
                <span>{analyzing ? t('article.analyzing') : t('article.analyze')}</span>
              </button>
            </div>
          </div>

          <h1 className="text-4xl lg:text-5xl font-serif font-medium leading-tight mb-8">
            {item.title}
          </h1>

          <div className="grid lg:grid-cols-3 gap-8 mb-12">
            <div className="lg:col-span-2">
              {item.summary ? (
                <div className="mb-6">
                  <h3 className="font-serif italic text-xl mb-2 text-stone-500">{t('article.aiSummary')}</h3>
                  <p className="font-sans text-lg leading-relaxed text-stone-900 whitespace-pre-line">
                    {item.summary}
                  </p>
                </div>
              ) : (
                <div className="mb-6 p-4 bg-stone-200/50 rounded border border-stone-300 border-dashed">
                  <p className="text-sm font-mono text-stone-500 mb-2">{t('article.aiPending')}</p>
                  <p className="font-sans text-base leading-relaxed text-stone-700 whitespace-pre-line opacity-80">
                    {item.contentSnippet || t('article.noPreview')}
                  </p>
                </div>
              )}

              <div className="p-6 bg-stone-200 border-l-2 border-[#141414]">
                <h4 className="font-mono text-xs uppercase mb-2 opacity-60">{t('article.aiAnalysis')}</h4>
                <p className="text-sm font-mono">
                  {t('article.sentiment')}: <span className={item.sentiment && item.sentiment > 0 ? 'text-emerald-700' : 'text-rose-700'}>{item.sentiment?.toFixed(3) || '0.000'}</span>
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {item.entities && item.entities.length > 0 ? (
                    item.entities.map((entity, index) => (
                      <span key={index} className="px-2 py-1 bg-white border border-stone-300 text-xs rounded-full">
                        {entity}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-stone-500 italic">{t('article.noEntities')}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="border border-[#141414] p-4">
                <h5 className="font-serif italic mb-2 text-sm opacity-60">{t('article.sourceVerification')}</h5>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm hover:underline"
                >
                  {t('article.originalArticle')} <ExternalLink size={14} />
                </a>
                <div className="mt-2 text-xs font-mono opacity-50 break-all">
                  {item.link}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="h-full flex items-center justify-center opacity-30">
          <div className="text-center">
            <div className="text-5xl font-serif mb-4 italic">{t('article.emptyTitle')}</div>
            <div className="font-mono text-sm">{t('article.emptyHint')}</div>
          </div>
        </div>
      )}
    </AnimatePresence>
  </div>
);

function safeDate(date: string) {
  try {
    return new Date(date).toLocaleString();
  } catch {
    return date;
  }
}

export default App;
