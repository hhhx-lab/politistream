import React, { useState, useEffect } from 'react';
import { NewsFeed } from './components/NewsFeed';
import { ParsedNewsItem, FeedSource } from './types';
import { ExternalLink, Shield, Activity, Database, Rss, Bookmark, Star, Copy, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

function App() {
  const [selectedItem, setSelectedItem] = useState<ParsedNewsItem | null>(null);
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [viewMode, setViewMode] = useState<'all' | 'favorites' | 'warehouse'>('all');
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetch('/api/feeds')
      .then(res => res.json())
      .then(data => setFeeds(data))
      .catch(console.error);
  }, []);

  const handleAnalyzeItem = async (id: number) => {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/news/${id}/analyze`, { method: 'POST' });
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

        const updatedItem = { ...data.data, entities };
        setSelectedItem(updatedItem);
      }
    } catch (e) {
      console.error(e);
    } finally {
        setAnalyzing(false);
    }
  };

  const handleCopyContent = () => {
    if (!selectedItem) return;
    const text = `
Title: ${selectedItem.title}
Source: ${selectedItem.source}
Date: ${selectedItem.pubDate}
Link: ${selectedItem.link}

Summary:
${selectedItem.summary || "N/A"}

Content:
${selectedItem.contentSnippet}
    `.trim();
    navigator.clipboard.writeText(text);
  };

  const handleReprocessAI = async () => {
    try {
      const res = await fetch('/api/refresh-ai', { method: 'POST' });
      const data = await res.json();
      console.log(`Reprocessing complete. ${data.processedCount} items processed.`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="h-screen w-full bg-[#E4E3E0] text-[#141414] font-sans flex overflow-hidden">
      {/* Sidebar / Navigation */}
      <div className="w-64 border-r border-[#141414] flex flex-col bg-[#E4E3E0] flex-shrink-0">
        <div className="h-16 border-b border-[#141414] flex items-center px-6 font-serif italic text-lg">
          PolitiStream
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-6">
            <h3 className="text-xs font-mono uppercase tracking-widest opacity-50 mb-4 px-2">System Status</h3>
            <div className="space-y-2">
              <div 
                onClick={() => setViewMode('all')}
                className={`flex items-center gap-3 px-2 py-1.5 cursor-pointer rounded transition-colors ${viewMode === 'all' ? 'bg-[#D4D3D0] opacity-100' : 'opacity-60 hover:opacity-100'}`}
              >
                <Activity size={16} />
                <span className="text-sm">Live Monitoring</span>
              </div>
              <div 
                onClick={() => setViewMode('favorites')}
                className={`flex items-center gap-3 px-2 py-1.5 cursor-pointer rounded transition-colors ${viewMode === 'favorites' ? 'bg-[#D4D3D0] opacity-100' : 'opacity-60 hover:opacity-100'}`}
              >
                <Bookmark size={16} />
                <span className="text-sm">Saved Library</span>
              </div>
              <div 
                onClick={() => setViewMode('warehouse')}
                className={`flex items-center gap-3 px-2 py-1.5 cursor-pointer rounded transition-colors ${viewMode === 'warehouse' ? 'bg-[#D4D3D0] opacity-100' : 'opacity-60 hover:opacity-100'}`}
                title="View items needing AI analysis"
              >
                <Database size={16} />
                <span className="text-sm">AI Work Queue</span>
              </div>
              <div className="flex items-center gap-3 px-2 py-1.5 opacity-60 hover:opacity-100 cursor-pointer">
                <Shield size={16} />
                <span className="text-sm">Governance</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-mono uppercase tracking-widest opacity-50 mb-4 px-2">Active Sources</h3>
            <div className="space-y-1">
              {feeds.map((feed, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-1.5 hover:bg-[#D4D3D0] rounded cursor-pointer group transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div>
                  <span className="text-xs font-mono truncate opacity-70 group-hover:opacity-100 transition-opacity" title={feed.name}>
                    {feed.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-[#141414] text-[10px] font-mono opacity-40 text-center">
          v1.0.4 / CONNECTED
        </div>
      </div>

      {/* Main Feed */}
      <div className="w-96 border-r border-[#141414] bg-[#F5F5F4] flex flex-col flex-shrink-0">
        <NewsFeed 
          key={viewMode}
          onSelect={setSelectedItem} 
          selectedId={selectedItem?.id}
          viewMode={viewMode}
        />
      </div>

      {/* Detail View */}
      <div className="flex-1 bg-[#E4E3E0] relative overflow-y-auto">
        <AnimatePresence mode="wait">
          {selectedItem ? (
            <motion.div 
              key={selectedItem.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-12 max-w-4xl mx-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4 font-mono text-xs uppercase tracking-widest opacity-60">
                    <span>{selectedItem.source}</span>
                    <span>/</span>
                    <span>{(() => {
                    try {
                        return new Date(selectedItem.pubDate).toLocaleString();
                    } catch (e) {
                        return selectedItem.pubDate;
                    }
                    })()}</span>
                    <span>/</span>
                    <span>ID: {selectedItem.id.toString().padStart(6, '0')}</span>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={handleCopyContent}
                        className="flex items-center gap-2 px-3 py-1.5 bg-stone-200 hover:bg-stone-300 rounded transition-colors text-stone-700 text-xs font-mono uppercase tracking-wider"
                        title="Copy to clipboard"
                    >
                        <Copy size={14} />
                        <span>Copy</span>
                    </button>
                    <button 
                        onClick={() => handleAnalyzeItem(selectedItem.id)}
                        disabled={analyzing}
                        className="flex items-center gap-2 px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-stone-100 rounded transition-colors text-xs font-mono uppercase tracking-wider disabled:opacity-50"
                        title="Analyze with AI"
                    >
                        <Wand2 size={14} className={analyzing ? "animate-spin" : ""} />
                        <span>{analyzing ? "Analyzing..." : "Analyze"}</span>
                    </button>
                </div>
              </div>

              <h1 className="text-5xl font-serif font-medium leading-tight mb-8">
                {selectedItem.title}
              </h1>

              <div className="grid grid-cols-3 gap-8 mb-12">
                <div className="col-span-2">
                  <div className="prose prose-stone prose-lg">
                    {selectedItem.summary ? (
                      <div className="mb-6">
                        <h3 className="font-serif italic text-xl mb-2 text-stone-500">AI Executive Summary</h3>
                        <p className="font-sans text-lg leading-relaxed text-stone-900 whitespace-pre-line">
                          {selectedItem.summary}
                        </p>
                      </div>
                    ) : (
                      <div className="mb-6 p-4 bg-stone-200/50 rounded border border-stone-300 border-dashed">
                        <p className="text-sm font-mono text-stone-500 mb-2">AI Analysis Pending...</p>
                        <p className="font-sans text-base leading-relaxed text-stone-700 whitespace-pre-line opacity-80">
                          {selectedItem.contentSnippet || (
                            <span className="italic opacity-60">
                              No preview content available. Please check the source link for the full article.
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    
                    <div className="p-6 bg-stone-200 border-l-2 border-[#141414]">
                      <h4 className="font-mono text-xs uppercase mb-2 opacity-60">AI Analysis</h4>
                      <p className="text-sm font-mono">
                        Sentiment Score: <span className={selectedItem.sentiment && selectedItem.sentiment > 0 ? 'text-emerald-700' : 'text-rose-700'}>{selectedItem.sentiment?.toFixed(3) || '0.000'}</span>
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {selectedItem.entities && selectedItem.entities.length > 0 ? (
                          selectedItem.entities.map((e, i) => (
                            <span key={i} className="px-2 py-1 bg-white border border-stone-300 text-xs rounded-full">
                              {e}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-stone-500 italic">No entities extracted</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="col-span-1 space-y-6">
                  <div className="border border-[#141414] p-4">
                    <h5 className="font-serif italic mb-2 text-sm opacity-60">Source Verification</h5>
                    <a 
                      href={selectedItem.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm hover:underline"
                    >
                      Original Article <ExternalLink size={14} />
                    </a>
                    <div className="mt-2 text-xs font-mono opacity-50 break-all">
                      {selectedItem.link}
                    </div>
                  </div>
                </div>
              </div>

            </motion.div>
          ) : (
            <div className="h-full flex items-center justify-center opacity-30">
              <div className="text-center">
                <div className="text-6xl font-serif mb-4 italic">PolitiStream</div>
                <div className="font-mono text-sm">Select an item from the wire to inspect</div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default App;
