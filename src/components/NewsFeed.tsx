import React, { useEffect, useState } from 'react';
import { ParsedNewsItem } from '../types';
import { NewsCard } from './NewsCard';
import { RefreshCw } from 'lucide-react';

interface NewsFeedProps {
  onSelect: (item: ParsedNewsItem) => void;
  selectedId?: number;
  viewMode: 'all' | 'favorites' | 'warehouse';
}

export const NewsFeed: React.FC<NewsFeedProps> = ({ onSelect, selectedId, viewMode }) => {
  const [news, setNews] = useState<ParsedNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  // Keep track of the current abort controller
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const fetchNews = async (reset = false) => {
    // Cancel previous request if it exists and we are resetting (switching views)
    if (reset && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new controller for this request
    const controller = new AbortController();
    if (reset) {
        abortControllerRef.current = controller;
    }

    try {
      const currentOffset = reset ? 0 : offset;
      let endpoint = `/api/news?limit=${LIMIT}&offset=${currentOffset}`;
      
      if (viewMode === 'favorites') {
        endpoint = '/api/favorites';
      } else if (viewMode === 'warehouse') {
        endpoint = `/api/news/pending?limit=${LIMIT}`;
      }
      
      const res = await fetch(endpoint, { signal: controller.signal });
      const data = await res.json();
      
      // Parse entities JSON safely
      const parsedData = data.map((item: any) => {
        let entities = [];
        try {
          if (typeof item.entities === 'string') {
            entities = JSON.parse(item.entities);
          } else if (Array.isArray(item.entities)) {
            entities = item.entities;
          }
        } catch (e) {
          console.warn("Failed to parse entities for item", item.id);
        }
        return {
          ...item,
          entities
        };
      });

      if (reset || viewMode === 'favorites') {
        setNews(parsedData);
        setOffset(LIMIT);
      } else {
        setNews(prev => [...prev, ...parsedData]);
        setOffset(prev => prev + LIMIT);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Fetch aborted');
        return;
      }
      console.error(err);
      if (reset) {
          setLoading(false);
      }
      setLoadingMore(false);
    }

    // Success path - only if not aborted (which is handled by catch/return above)
    if (reset) {
        setLoading(false);
    }
    setLoadingMore(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (viewMode === 'all') {
        await fetch('/api/refresh', { method: 'POST' });
      } else if (viewMode === 'warehouse') {
        await fetch('/api/refresh-ai', { method: 'POST' });
      }
      await fetchNews(true);
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLoadMore = async () => {
    if (viewMode === 'favorites' || viewMode === 'warehouse') return;
    setLoadingMore(true);
    await fetchNews(false);
  };

  // ...

  let title = 'Live Wire';
  if (viewMode === 'favorites') title = 'Saved Library';
  if (viewMode === 'warehouse') title = 'AI Work Queue';

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-stone-300 flex justify-between items-center bg-stone-50 sticky top-0 z-10">
        <h2 className="font-serif italic text-stone-500">
          {title}
        </h2>
        <button 
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 hover:bg-stone-200 rounded-full transition-colors disabled:opacity-50"
          title={viewMode === 'warehouse' ? "Run Batch Processing" : "Refresh Feed"}
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1">
        {news.length === 0 ? (
          <div className="p-8 text-center text-stone-400 font-mono text-sm">
            {viewMode === 'favorites' ? 'No saved items found.' : 
             viewMode === 'warehouse' ? 'No pending items. All clear!' : 'No news items found.'}
          </div>
        ) : (
          <>
            {news.map(item => (
              <NewsCard 
                key={item.id} 
                item={item} 
                onSelect={onSelect} 
                selected={selectedId === item.id}
                onToggleFavorite={() => handleToggleFavorite(item)}
              />
            ))}
            {viewMode === 'all' && (
              <div className="p-4 text-center">
                <button 
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 rounded text-stone-600 text-sm font-mono transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : 'Load More Archives'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
