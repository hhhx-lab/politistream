import React, { useEffect, useState } from 'react';
import { ParsedNewsItem } from '../types';
import { NewsCard } from './NewsCard';
import { RefreshCw } from 'lucide-react';

interface NewsFeedProps {
  onSelect: (item: ParsedNewsItem) => void;
  selectedId?: number;
  viewMode: 'all' | 'favorites';
}

export const NewsFeed: React.FC<NewsFeedProps> = ({ onSelect, selectedId, viewMode }) => {
  const [news, setNews] = useState<ParsedNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = async () => {
    try {
      const endpoint = viewMode === 'favorites' ? '/api/favorites' : '/api/news';
      const res = await fetch(endpoint);
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
      setNews(parsedData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (viewMode === 'all') {
        await fetch('/api/refresh', { method: 'POST' });
      }
      await fetchNews();
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleFavorite = async (item: ParsedNewsItem) => {
    const newStatus = !item.is_favorite;
    
    // Optimistic update
    setNews(prev => prev.map(n => 
      n.id === item.id ? { ...n, is_favorite: newStatus ? 1 : 0 } : n
    ));

    try {
      await fetch(`/api/news/${item.id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: newStatus })
      });
    } catch (e) {
      console.error("Failed to toggle favorite", e);
      // Revert on error
      setNews(prev => prev.map(n => 
        n.id === item.id ? { ...n, is_favorite: item.is_favorite } : n
      ));
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchNews();
    const interval = setInterval(fetchNews, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [viewMode]); // Re-fetch when viewMode changes

  if (loading) {
    return <div className="p-8 font-mono text-sm text-stone-400">Initializing Uplink...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-stone-300 flex justify-between items-center bg-stone-50 sticky top-0 z-10">
        <h2 className="font-serif italic text-stone-500">
          {viewMode === 'favorites' ? 'Saved Library' : 'Live Wire'}
        </h2>
        <button 
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 hover:bg-stone-200 rounded-full transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="overflow-y-auto flex-1">
        {news.length === 0 ? (
          <div className="p-8 text-center text-stone-400 font-mono text-sm">
            {viewMode === 'favorites' ? 'No saved items found.' : 'No news items found.'}
          </div>
        ) : (
          news.map(item => (
            <NewsCard 
              key={item.id} 
              item={item} 
              onSelect={onSelect} 
              selected={selectedId === item.id}
              onToggleFavorite={() => handleToggleFavorite(item)}
            />
          ))
        )}
      </div>
    </div>
  );
};
