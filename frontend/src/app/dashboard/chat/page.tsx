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
  MessageCircle,
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

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'instant',
    });
  }, []);

  // Detect scroll position
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShowScrollBtn(!isNearBottom);
  };

  // Load welcome message
  useEffect(() => {
    const loadWelcome = async () => {
      try {
        const res = await chatApi.getWelcome();
        const { conversationId: convId, message } = res.data.data;
        setConversationId(convId);
        setMessages([
          {
            role: 'assistant',
            content: message.content,
            metadata: message.metadata,
          },
        ]);
      } catch {
        setMessages([
          {
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
          },
        ]);
      } finally {
        setWelcomeLoading(false);
      }
    };
    loadWelcome();
  }, [user?.name]);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  // Send message
  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // Add user message immediately
    const userMsg: ChatMessage = { role: 'user', content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await chatApi.sendMessage({
        message: msg,
        conversationId: conversationId || undefined,
      });

      const { conversationId: convId, message: response } = res.data.data;
      setConversationId(convId);

      setMessages((prev) => [
        ...prev,
        {
          id: response.id,
          role: 'assistant',
          content: response.content,
          metadata: response.metadata,
          createdAt: response.createdAt,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry, I couldn't process that. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle suggestion click
  const handleSuggestion = (suggestion: Suggestion) => {
    // Navigation actions
    if (suggestion.action.startsWith('navigate_')) {
      const page = suggestion.action.replace('navigate_', '');
      router.push(`/dashboard/${page}`);
      return;
    }

    // Search actions — convert to a natural message
    const actionMessages: Record<string, string> = {
      search_products: 'Help me find a product',
      search_flights: 'I want to book a flight',
      search_hotels: 'Help me find a hotel',
      search_food: 'I want to order food',
      search_events: 'Find me events and tickets',
      search_cars: 'I need to rent a car',
      check_orders: 'Show me my recent orders',
      search_tech: 'Show me trending tech deals',
      search_getaway: 'Plan a weekend getaway for me',
      search_gifts: 'I need gift ideas',
      search_fitness: 'Find fitness and wellness gear',
      filter_price: 'I have a specific budget in mind',
      filter_brand: 'I want a specific brand',
      compare: 'Compare the top options for me',
      class_economy: 'Economy class please',
      class_business: 'Business class please',
      flexible_dates: 'My dates are flexible, find the cheapest option',
      nonstop: 'I prefer nonstop flights only',
      budget: 'I want budget-friendly options under $100/night',
      midrange: 'Mid-range, $100-250 per night',
      luxury: 'Show me luxury options',
      pool: 'Must have a pool',
      delivery: 'I want food delivery',
      pickup: 'I want to pick up the food',
      grocery: 'I need to order groceries',
      mealkit: 'Show me meal kit options',
      concerts: 'Find me concerts nearby',
      sports: 'Find me sports events',
      theater: 'Find me theater shows',
      comedy: 'Find me comedy shows',
      economy_car: 'An economy car is fine',
      suv: 'I need an SUV',
      luxury_car: 'A luxury car please',
      airport: 'Airport pickup and return',
      search_now: 'Search for the best price now',
      price_alert: 'Set a price alert for me',
      price_history: 'Show me the price history',
    };

    const msg = actionMessages[suggestion.action] || suggestion.label;
    sendMessage(msg);
  };

  // New conversation
  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setWelcomeLoading(true);
    chatApi.getWelcome().then((res) => {
      const { conversationId: convId, message } = res.data.data;
      setConversationId(convId);
      setMessages([
        {
          role: 'assistant',
          content: message.content,
          metadata: message.metadata,
        },
      ]);
      setWelcomeLoading(false);
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8 bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-600/20">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Swiftbuy Assistant</h1>
            <p className="text-xs text-gray-500">Search, shop, book — all through chat</p>
          </div>
        </div>
        <button
          onClick={startNewConversation}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {welcomeLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                user={user}
                onSuggestionClick={handleSuggestion}
              />
            ))
          )}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shrink-0">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <div className="bg-white/[0.03] rounded-2xl rounded-tl-md px-4 py-3 border border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
                  <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
                  <div className="w-2 h-2 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => scrollToBottom()}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 border border-white/10 rounded-full shadow-lg text-xs text-gray-300 hover:text-white transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
            Scroll to bottom
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-white/5 bg-gray-900">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-end gap-3 bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 focus-within:border-brand-500/50 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Ask me anything — find products, book flights, order food..."
              className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none resize-none leading-relaxed max-h-40"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl transition-all shrink-0',
                input.trim() && !loading
                  ? 'bg-brand-600 text-white hover:bg-brand-500 shadow-md shadow-brand-600/20'
                  : 'bg-white/5 text-gray-500 cursor-not-allowed'
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">
            Swiftbuy can search, compare, and purchase across products, flights, hotels, food, events & more
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Message Bubble Component ─── */

function MessageBubble({
  message,
  user,
  onSuggestionClick,
}: {
  message: ChatMessage;
  user: any;
  onSuggestionClick: (s: Suggestion) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      {isUser ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400 font-semibold text-xs shrink-0">
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shrink-0">
          <Zap className="h-4 w-4 text-white" />
        </div>
      )}

      {/* Content */}
      <div className={cn('flex flex-col max-w-[85%]', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed',
            isUser
              ? 'bg-brand-600 text-white rounded-tr-md'
              : 'bg-white/[0.03] text-gray-200 border border-white/5 rounded-tl-md'
          )}
        >
          <FormattedContent content={message.content} isUser={isUser} />
        </div>

        {/* Suggestions */}
        {message.metadata?.suggestions && message.metadata.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {message.metadata.suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => onSuggestionClick(s)}
                className="group flex items-center gap-2 px-3.5 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-sm text-gray-300 hover:border-brand-500/30 hover:bg-brand-500/5 hover:text-brand-400 transition-all"
              >
                <span className="text-base">{s.icon}</span>
                <span className="font-medium">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Formatted content (bold, italic, newlines) ─── */

function FormattedContent({ content, isUser }: { content: string; isUser: boolean }) {
  // Split by double newlines for paragraphs
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
  // Handle bullet points
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
  // Replace **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className={cn('font-semibold', !isUser && 'text-white')}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
