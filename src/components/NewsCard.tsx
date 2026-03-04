import React from 'react';
import { ParsedNewsItem } from '../types';
import { motion } from 'motion/react';
import { ExternalLink, Share2, ShieldCheck, AlertTriangle, Bookmark } from 'lucide-react';
import { formatDistanceToNow, isValid } from 'date-fns';

interface NewsCardProps {
  item: ParsedNewsItem;
  onSelect: (item: ParsedNewsItem) => void;
  selected: boolean;
  onToggleFavorite: () => void;
}

export const NewsCard: React.FC<NewsCardProps> = ({ item, onSelect, selected, onToggleFavorite }) => {
  const sentimentColor = 
    (item.sentiment || 0) > 0.3 ? 'text-emerald-600' : 
    (item.sentiment || 0) < -0.3 ? 'text-rose-600' : 
    'text-stone-500';

  let timeAgo = 'recently';
  try {
    const date = new Date(item.pubDate);
    if (isValid(date)) {
      timeAgo = formatDistanceToNow(date, { addSuffix: true });
    }
  } catch (e) {
    // Fallback
  }

  return (
    <motion.div 
      layoutId={`card-${item.id}`}
      onClick={() => onSelect(item)}
      className={`
        group relative border-b border-stone-300 p-4 cursor-pointer transition-colors duration-200
        ${selected ? 'bg-stone-200' : 'hover:bg-stone-100'}
      `}
    >
      <div className={`absolute top-4 right-4 z-10 transition-opacity ${item.is_favorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`p-1.5 rounded-full hover:bg-stone-300 transition-colors ${item.is_favorite ? 'text-amber-600 opacity-100' : 'text-stone-400'}`}
          title={item.is_favorite ? "Remove from library" : "Save to library"}
        >
          <Bookmark size={16} fill={item.is_favorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex justify-between items-baseline mb-2 gap-2 pr-8">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-600 bg-stone-200/50 px-1.5 py-0.5 rounded border border-stone-300/50 truncate max-w-[75%]" title={item.source}>
          {item.source}
        </span>
        <span className="font-mono text-[10px] text-stone-400 flex-shrink-0">
          {timeAgo}
        </span>
      </div>
      
      <h3 className={`
        font-serif text-lg leading-tight mb-2
        ${selected ? 'text-stone-900 font-semibold' : 'text-stone-800'}
      `}>
        {item.title}
      </h3>

      {item.summary && (
        <p className="text-sm text-stone-600 line-clamp-4 mb-3 font-sans whitespace-pre-line">
          {item.summary}
        </p>
      )}

      <div className="flex items-center gap-3 mt-2 opacity-60 group-hover:opacity-100 transition-opacity">
        <div className={`flex items-center gap-1 text-xs font-mono ${sentimentColor}`}>
          <ShieldCheck size={12} />
          <span>{item.sentiment?.toFixed(2) || '0.00'}</span>
        </div>
        {item.entities && item.entities.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {item.entities.slice(0, 2).map((entity, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-stone-200 text-stone-600 rounded-sm uppercase tracking-tight">
                {entity}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
