import React, { useState } from 'react';
import { Plus, Power, RefreshCw } from 'lucide-react';
import { FeedRefreshResult, FeedSource } from '../types';

interface RSSSourceManagerProps {
  sources: FeedSource[];
  onSourcesChange: (sources: FeedSource[]) => void;
  onRefreshComplete: () => void;
}

export const RSSSourceManager: React.FC<RSSSourceManagerProps> = ({
  sources,
  onSourcesChange,
  onRefreshComplete,
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  const loadSources = async () => {
    const res = await fetch('/api/feeds');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    onSourcesChange(data);
    return data as FeedSource[];
  };

  const addSource = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setName('');
      setUrl('');
      await loadSources();
      setMessage('Source added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = async (source: FeedSource) => {
    setMessage('');
    try {
      const res = await fetch(`/api/feeds/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await loadSources();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const refreshSource = async (source: FeedSource) => {
    setRefreshingId(source.id);
    setMessage('');
    try {
      const res = await fetch(`/api/feeds/${source.id}/refresh`, { method: 'POST' });
      const data = await res.json() as FeedRefreshResult;
      if (!res.ok && !data.source) throw new Error((data as any).error || `HTTP ${res.status}`);
      await loadSources();
      onRefreshComplete();
      setMessage(data.success ? `Added ${data.newItems} item(s).` : data.error || 'Refresh failed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-stone-100 border-r border-[#141414]">
      <div className="p-4 border-b border-stone-300">
        <h2 className="font-serif italic text-stone-600">RSS Sources</h2>
      </div>

      <form className="p-4 border-b border-stone-300 space-y-2" onSubmit={addSource}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Source name"
          className="w-full border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/feed.xml"
          className="w-full border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !name.trim() || !url.trim()}
          className="w-full flex items-center justify-center gap-2 bg-stone-900 text-stone-100 px-3 py-2 text-sm disabled:opacity-50"
        >
          <Plus size={14} />
          Add Source
        </button>
        {message && <p className="text-xs font-mono text-stone-700 break-words">{message}</p>}
      </form>

      <div className="flex-1 overflow-y-auto">
        {sources.map((source) => (
          <div key={source.id ?? source.url} className="p-3 border-b border-stone-300">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-serif leading-tight truncate" title={source.name}>{source.name}</div>
                <div className="text-[10px] font-mono opacity-50 truncate" title={source.url}>{source.url}</div>
              </div>
              <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${source.enabled ? 'bg-emerald-600' : 'bg-stone-400'}`} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => refreshSource(source)}
                disabled={!source.enabled || refreshingId === source.id}
                className="p-1.5 hover:bg-stone-200 rounded disabled:opacity-40"
                title="Refresh source"
              >
                <RefreshCw size={14} className={refreshingId === source.id ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => toggleSource(source)}
                className="p-1.5 hover:bg-stone-200 rounded"
                title={source.enabled ? 'Disable source' : 'Enable source'}
              >
                <Power size={14} />
              </button>
              <span className="text-[10px] font-mono opacity-50 truncate">
                {source.last_fetched_at ? new Date(source.last_fetched_at).toLocaleString() : 'Never refreshed'}
              </span>
            </div>
            {source.last_error && (
              <div className="mt-2 text-[10px] font-mono text-rose-700 break-words">
                {source.last_error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
