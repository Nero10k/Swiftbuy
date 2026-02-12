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
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that. Please try again." }]);
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

function FormattedContent({ content, isUser }: { content: string; isUser: boolean }) {
  const paragraphs = content.split('\n\n');
  return (
    <div className="space-y-3">
      {paragraphs.map((para, pi) => (
        <div key={pi}>
          {para.split('\n').map((line, li) => (
            <p key={li} className={li > 0 ? 'mt-1' : ''}>
              {formatLine(line, isUser)}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function formatLine(text: string, isUser: boolean) {
  if (text.startsWith('• ') || text.startsWith('- ')) {
    return (
      <span className="flex items-start gap-2">
        <span className={cn('mt-1.5 h-1.5 w-1.5 rounded-full shrink-0', isUser ? 'bg-brand-300' : 'bg-brand-400')} />
        <span>{formatInline(text.slice(2), isUser)}</span>
      </span>
    );
  }
  return formatInline(text, isUser);
}

function formatInline(text: string, isUser: boolean) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className={cn('font-semibold', !isUser && 'text-white')}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
