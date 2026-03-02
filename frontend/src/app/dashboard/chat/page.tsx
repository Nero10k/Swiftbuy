'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { chatApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  Send,
  Zap,
  Loader2,
  Plus,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface Suggestion {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: string;
}

interface ChatMessageMeta {
  type?: string;
  suggestions?: Suggestion[];
  intent?: string;
  category?: string;
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: ChatMessageMeta;
  createdAt?: string;
}

export default function ChatPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [welcomeLoading, setWelcomeLoading] = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShowScrollBtn(!isNearBottom);
  };

  useEffect(() => {
    const loadWelcome = async () => {
      try {
        const res = await chatApi.getWelcome();
        const { conversationId: convId, message } = res.data.data;
        setConversationId(convId);
        setMessages([{ role: 'assistant', content: message.content, metadata: message.metadata }]);
      } catch {
        setMessages([{
          role: 'assistant',
          content: `Hey${user?.name ? ` ${user.name}` : ''}! 👋 I'm your Swiftbuy assistant. I can help you find products, book flights, reserve hotels, order food, and more. What would you like to do?`,
          metadata: {
            type: 'suggestions',
            suggestions: [
              { id: '1', label: 'Shop for products', description: 'Search across retailers', icon: '🛒', action: 'search_products' },
              { id: '2', label: 'Book a flight', description: 'Search airlines', icon: '✈️', action: 'search_flights' },
              { id: '3', label: 'Find a hotel', description: 'Search accommodations', icon: '🏨', action: 'search_hotels' },
              { id: '4', label: 'Order food', description: 'Restaurants & delivery', icon: '🍕', action: 'search_food' },
            ],
          },
        }]);
      } finally {
        setWelcomeLoading(false);
      }
    };
    loadWelcome();
  }, [user?.name]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await chatApi.sendMessage({ message: msg, conversationId: conversationId || undefined });
      const { conversationId: convId, message: response } = res.data.data;
      setConversationId(convId);
      setMessages((prev) => [...prev, { id: response.id, role: 'assistant', content: response.content, metadata: response.metadata, createdAt: response.createdAt }]);
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.message || "Something went wrong";
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${errMsg}` }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleSuggestion = (suggestion: Suggestion) => {
    if (suggestion.action.startsWith('navigate_')) { router.push(`/dashboard/${suggestion.action.replace('navigate_', '')}`); return; }
    const actionMessages: Record<string, string> = {
      search_products: 'Help me find a product', search_flights: 'I want to book a flight',
      search_hotels: 'Help me find a hotel', search_food: 'I want to order food',
      search_events: 'Find me events and tickets', search_cars: 'I need to rent a car',
      check_orders: 'Show me my recent orders',
    };
    sendMessage(actionMessages[suggestion.action] || suggestion.label);
  };

  const startNewConversation = () => {
    setConversationId(null); setMessages([]); setWelcomeLoading(true);
    chatApi.getWelcome().then((res) => {
      const { conversationId: convId, message } = res.data.data;
      setConversationId(convId);
      setMessages([{ role: 'assistant', content: message.content, metadata: message.metadata }]);
      setWelcomeLoading(false);
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8 bg-[#060606]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#0a0a0a] border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600/20">
            <Sparkles className="h-4 w-4 text-brand-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Swiftbuy Assistant</h1>
            <p className="text-[10px] text-gray-500">Search, shop, book — all through chat</p>
          </div>
        </div>
        <button onClick={startNewConversation}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors">
          <Plus className="h-3.5 w-3.5" /> New Chat
        </button>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {welcomeLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} user={user} onSuggestionClick={handleSuggestion} />
            ))
          )}

          {loading && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600/20 shrink-0">
                <Zap className="h-3.5 w-3.5 text-brand-400" />
              </div>
              <div className="bg-white/[0.03] rounded-2xl rounded-tl-md px-4 py-3 border border-white/[0.06]">
                <div className="flex gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {showScrollBtn && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10">
          <button onClick={() => scrollToBottom()}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#0a0a0a] border border-white/[0.08] rounded-full shadow-lg text-[10px] text-gray-400 hover:text-white transition-colors">
            <ChevronDown className="h-3 w-3" /> Scroll to bottom
          </button>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-white/[0.06] bg-[#0a0a0a]">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-end gap-3 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 focus-within:border-brand-500/40 focus-within:ring-1 focus-within:ring-brand-500/10 transition-all">
            <textarea ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
              rows={1} placeholder="Ask me anything — find products, book flights, order food..."
              className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none resize-none leading-relaxed max-h-40" />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
              className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition-all shrink-0',
                input.trim() && !loading ? 'bg-brand-600 text-white hover:bg-brand-500' : 'bg-white/[0.04] text-gray-600 cursor-not-allowed')}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-600 text-center mt-2">
            Products · Flights · Hotels · Food · Events & more
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, user, onSuggestionClick }: { message: ChatMessage; user: any; onSuggestionClick: (s: Suggestion) => void; }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {isUser ? (
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-gray-300 font-semibold text-[10px] shrink-0">
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600/20 shrink-0">
          <Zap className="h-3.5 w-3.5 text-brand-400" />
        </div>
      )}

      <div className={cn('flex flex-col max-w-[85%]', isUser && 'items-end')}>
        <div className={cn('rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser ? 'bg-brand-600 text-white rounded-tr-md' : 'bg-white/[0.03] text-gray-300 border border-white/[0.06] rounded-tl-md')}>
          <FormattedContent content={message.content} isUser={isUser} />
        </div>

        {message.metadata?.suggestions && message.metadata.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {message.metadata.suggestions.map((s) => (
              <button key={s.id} onClick={() => onSuggestionClick(s)}
                className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-xl text-xs text-gray-400 hover:border-brand-500/30 hover:text-brand-400 transition-all">
                <span className="text-sm">{s.icon}</span>
                <span className="font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

/** Inline: bold, italic, markdown links */
function formatInline(text: string, isUser: boolean): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]*\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} className={cn('font-semibold', !isUser && 'text-white')}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i} className="italic">{part.slice(1, -1)}</em>;
        const link = part.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
        if (link) {
          const label = link[1];
          const href = link[2];
          const isViewLink = label.toLowerCase().includes('view');
          // Strip trailing ↗ if Claude already added it, we'll add our own
          const cleanLabel = label.replace(/\s*↗\s*$/, '').trim();
          return isViewLink ? (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1 px-3 py-1 bg-brand-600/20 hover:bg-brand-600/40 border border-brand-500/30 hover:border-brand-400/60 text-brand-300 hover:text-brand-200 text-xs font-medium rounded-lg transition-all">
              {cleanLabel} ↗
            </a>
          ) : (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer"
              className="text-brand-400 hover:text-brand-300 underline underline-offset-2 transition-colors">
              {cleanLabel}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

type Block =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'bullet-list'; items: string[] }
  | { type: 'numbered-list'; items: { num: string; lines: string[] }[] }
  | { type: 'divider' };

/** Parse flat lines into semantic blocks */
function parseBlocks(content: string): Block[] {
  const rawLines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { blocks.push({ type: 'divider' }); i++; continue; }

    // Numbered list item: "1. …" or "1) …"
    const numMatch = line.match(/^(\d+)[.)]\s+(.*)/);
    if (numMatch) {
      const items: { num: string; lines: string[] }[] = [];
      while (i < rawLines.length) {
        const m = rawLines[i].match(/^(\d+)[.)]\s+(.*)/);
        if (m) {
          // Collect continuation lines (indented or link-only lines)
          const sub = [m[2]];
          i++;
          while (i < rawLines.length && rawLines[i] !== '' && !rawLines[i].match(/^\d+[.)]\s+/)) {
            sub.push(rawLines[i]); i++;
          }
          items.push({ num: m[1], lines: sub });
        } else break;
      }
      blocks.push({ type: 'numbered-list', items }); continue;
    }

    // Bullet list item
    if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = [];
      while (i < rawLines.length) {
        const l = rawLines[i];
        if (l.startsWith('• ') || l.startsWith('- ') || l.startsWith('* ')) {
          items.push(l.replace(/^[•\-*]\s+/, '')); i++;
        } else break;
      }
      blocks.push({ type: 'bullet-list', items }); continue;
    }

    // Blank line → paragraph separator (skip)
    if (line.trim() === '') { i++; continue; }

    // Regular paragraph — collect until blank/list
    const lines: string[] = [];
    while (i < rawLines.length && rawLines[i].trim() !== '' && !rawLines[i].match(/^(\d+[.)]\s+|[•\-*]\s+|---)/)) {
      lines.push(rawLines[i]); i++;
    }
    if (lines.length) blocks.push({ type: 'paragraph', lines });
  }
  return blocks;
}

function FormattedContent({ content, isUser }: { content: string; isUser: boolean }) {
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => {
        if (block.type === 'divider')
          return <hr key={bi} className="border-white/[0.06]" />;

        if (block.type === 'bullet-list')
          return (
            <ul key={bi} className="space-y-1.5">
              {block.items.map((item, ii) => (
                <li key={ii} className="flex items-start gap-2">
                  <span className={cn('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0', isUser ? 'bg-brand-300' : 'bg-brand-400')} />
                  <span className="text-sm leading-relaxed">{formatInline(item, isUser)}</span>
                </li>
              ))}
            </ul>
          );

        if (block.type === 'numbered-list')
          return (
            <div key={bi} className="space-y-3">
              {block.items.map((item, ii) => {
                // Split sub-lines into text lines and link lines
                const textLines = item.lines.filter(l => !l.match(/^\[.*\]\(.*\)$/));
                const linkLines = item.lines.filter(l => l.match(/^\[.*\]\(.*\)$/));
                return (
                  <div key={ii} className={cn(
                    'rounded-xl border p-3',
                    isUser
                      ? 'bg-brand-700/20 border-brand-500/20'
                      : 'bg-white/[0.03] border-white/[0.07]'
                  )}>
                    <div className="flex items-start gap-2.5">
                      <span className="text-[10px] font-bold text-brand-400 bg-brand-600/20 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">
                        {item.num}
                      </span>
                      <div className="flex-1 min-w-0">
                        {textLines.map((l, li) => (
                          <p key={li} className={cn('text-sm leading-relaxed', li === 0 ? '' : 'mt-0.5 text-gray-400 text-xs')}>
                            {formatInline(l, isUser)}
                          </p>
                        ))}
                        {linkLines.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {linkLines.map((l, li) => <span key={li}>{formatInline(l, isUser)}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );

        // Paragraph
        return (
          <div key={bi} className="space-y-1">
            {block.lines.map((line, li) => (
              <p key={li} className="text-sm leading-relaxed">{formatInline(line, isUser)}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
