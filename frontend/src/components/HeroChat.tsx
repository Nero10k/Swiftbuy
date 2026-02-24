'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/* ─── Scenario Data ─── */

interface ChatLine {
  role: 'human' | 'agent' | 'results';
  text: string;
  results?: { label: string; detail: string; price: string; highlight?: boolean }[];
}

interface Scenario {
  lines: ChatLine[];
}

const SCENARIOS: Scenario[] = [
  {
    lines: [
      { role: 'human', text: 'Find me wireless headphones under €100' },
      { role: 'agent', text: 'Searching Dutch retailers for wireless headphones...' },
      {
        role: 'results',
        text: '',
        results: [
          { label: 'Sony WH-CH720N', detail: 'MediaMarkt · ⭐ 4.6', price: '€79.99', highlight: true },
          { label: 'JBL Tune 770NC', detail: 'Bol · ⭐ 4.5', price: '€83.99' },
          { label: 'Philips TAH5206', detail: 'Coolblue · ⭐ 4.3', price: '€49.99' },
        ],
      },
      { role: 'human', text: 'Get the Sony ones' },
      { role: 'agent', text: '✅ Ordered! Sony WH-CH720N for €79.99 from MediaMarkt. Paid with USDC. Arriving Thursday.' },
    ],
  },
  {
    lines: [
      { role: 'human', text: 'Book me a flight to Amsterdam next Friday' },
      { role: 'agent', text: 'Searching flights to Amsterdam for Feb 21...' },
      {
        role: 'results',
        text: '',
        results: [
          { label: 'KLM — direct, 3h 10m', detail: 'Departs 11:45 AM', price: '€129', highlight: true },
          { label: 'Wizz Air — direct, 3h 15m', detail: 'Departs 6:30 AM', price: '€49' },
          { label: 'Ryanair — 1 stop, 5h 40m', detail: 'Departs 8:00 AM', price: '€42' },
        ],
      },
      { role: 'human', text: 'Book the Wizz Air flight' },
      { role: 'agent', text: '✅ Booked! Wizz Air to Amsterdam, Feb 21, 6:30 AM. €49 via Karma Wallet. Confirmation sent.' },
    ],
  },
  {
    lines: [
      { role: 'human', text: 'Find a hotel near La Rambla under €150/night' },
      { role: 'agent', text: 'Searching hotels near La Rambla, Barcelona...' },
      {
        role: 'results',
        text: '',
        results: [
          { label: 'Hotel Catalonia Ramblas', detail: '4★ · 0.2 km from La Rambla', price: '€128/n', highlight: true },
          { label: 'Citadines Ramblas', detail: '3★ · 0.4 km from La Rambla', price: '€95/n' },
          { label: 'Hotel Continental BCN', detail: '3★ · On La Rambla', price: '€112/n' },
        ],
      },
      { role: 'human', text: 'Book the Catalonia for 2 nights' },
      { role: 'agent', text: '✅ Reserved! Hotel Catalonia Ramblas, 2 nights — €256 total. Paid with USDC. Confirmation #HR-8291.' },
    ],
  },
  {
    lines: [
      { role: 'human', text: 'Buy me the latest AirPods' },
      { role: 'agent', text: 'Searching for AirPods across retailers...' },
      {
        role: 'results',
        text: '',
        results: [
          { label: 'AirPods Pro 2 (USB-C)', detail: 'Apple Store · ⭐ 4.8', price: '€279', highlight: true },
          { label: 'AirPods 4 with ANC', detail: 'MediaMarkt · ⭐ 4.6', price: '€199' },
          { label: 'AirPods 4', detail: 'Bol · ⭐ 4.5', price: '€149' },
        ],
      },
      { role: 'human', text: 'Get the AirPods Pro 2' },
      { role: 'agent', text: '✅ Ordered! AirPods Pro 2 for €279 from Apple Store. Paid with USDC. Arriving Wednesday.' },
    ],
  },
];

/* ─── Typing Speed Config ─── */
const CHAR_DELAY = 28;       // ms per character
const LINE_PAUSE = 600;      // pause between lines
const RESULTS_PAUSE = 400;   // pause before showing results
const SCENARIO_PAUSE = 3000; // pause after scenario completes
const FADE_DURATION = 500;   // fade out duration

export default function HeroChat() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [visibleLines, setVisibleLines] = useState<ChatLine[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [fading, setFading] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Blinking cursor
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleLines, currentText, showResults]);

  const typeText = useCallback(
    (text: string, onComplete: () => void) => {
      let i = 0;
      setCurrentText('');
      setIsTyping(true);
      const type = () => {
        if (i < text.length) {
          setCurrentText(text.substring(0, i + 1));
          i++;
          timeoutRef.current = setTimeout(type, CHAR_DELAY);
        } else {
          setIsTyping(false);
          onComplete();
        }
      };
      type();
    },
    []
  );

  const playScenario = useCallback(
    (scenario: Scenario) => {
      const lines = scenario.lines;
      let lineIdx = 0;

      const processLine = () => {
        if (lineIdx >= lines.length) {
          // Scenario done — pause then fade
          timeoutRef.current = setTimeout(() => {
            setFading(true);
            timeoutRef.current = setTimeout(() => {
              setFading(false);
              setVisibleLines([]);
              setCurrentText('');
              setShowResults(false);
              setScenarioIdx((prev) => (prev + 1) % SCENARIOS.length);
            }, FADE_DURATION);
          }, SCENARIO_PAUSE);
          return;
        }

        const line = lines[lineIdx];

        if (line.role === 'results') {
          // Show results card (no typing)
          timeoutRef.current = setTimeout(() => {
            setShowResults(true);
            setVisibleLines((prev) => [...prev, line]);
            lineIdx++;
            timeoutRef.current = setTimeout(processLine, LINE_PAUSE);
          }, RESULTS_PAUSE);
        } else {
          // Type out the text
          typeText(line.text, () => {
            setVisibleLines((prev) => [...prev, { ...line, text: line.text }]);
            setCurrentText('');
            lineIdx++;
            timeoutRef.current = setTimeout(processLine, LINE_PAUSE);
          });
        }
      };

      processLine();
    },
    [typeText]
  );

  // Start scenario
  useEffect(() => {
    const scenario = SCENARIOS[scenarioIdx];
    playScenario(scenario);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [scenarioIdx, playScenario]);

  // Determine current typing role
  const scenario = SCENARIOS[scenarioIdx];
  const nextLineIdx = visibleLines.length;
  const currentRole =
    nextLineIdx < scenario.lines.length ? scenario.lines[nextLineIdx].role : null;

  return (
    <div
      className={`bg-black/60 rounded-3xl shadow-2xl shadow-black/30 overflow-hidden border border-white/10 transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/5">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="text-gray-500 text-xs font-mono ml-2">
          swiftbuy — agent session
        </span>
      </div>

      {/* Chat area */}
      <div
        ref={containerRef}
        className="p-6 space-y-4 font-mono text-sm min-h-[320px] max-h-[320px] overflow-hidden"
      >
        {/* Rendered lines */}
        {visibleLines.map((line, i) => {
          if (line.role === 'results' && line.results) {
            return (
              <div
                key={i}
                className="bg-white/5 rounded-xl p-4 border border-white/5 animate-in fade-in duration-300"
              >
                <div className="text-gray-600 text-xs mb-3">SWIFTBUY RESULTS</div>
                <div className="space-y-2">
                  {line.results.map((r, ri) => (
                    <div
                      key={ri}
                      className={`flex justify-between items-center ${
                        r.highlight ? 'text-white' : 'text-gray-400'
                      }`}
                    >
                      <div>
                        <span className="text-gray-500 mr-2">{ri + 1}.</span>
                        <span>{r.label}</span>
                        <span className="text-gray-600 ml-2 text-xs">{r.detail}</span>
                      </div>
                      <span
                        className={
                          r.highlight ? 'text-green-400 font-medium' : 'text-gray-500'
                        }
                      >
                        {r.price}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex gap-3">
              <span
                className={`shrink-0 ${
                  line.role === 'human' ? 'text-purple-400' : 'text-green-400'
                }`}
              >
                {line.role === 'human' ? 'human' : 'agent'}
              </span>
              <span
                className={
                  line.role === 'human'
                    ? 'text-gray-300'
                    : line.text.startsWith('✅')
                    ? 'text-green-300/90'
                    : 'text-gray-500'
                }
              >
                {line.text}
              </span>
            </div>
          );
        })}

        {/* Currently typing line */}
        {currentText && currentRole && currentRole !== 'results' && (
          <div className="flex gap-3">
            <span
              className={`shrink-0 ${
                currentRole === 'human' ? 'text-purple-400' : 'text-green-400'
              }`}
            >
              {currentRole === 'human' ? 'human' : 'agent'}
            </span>
            <span
              className={
                currentRole === 'human' ? 'text-gray-300' : 'text-gray-500'
              }
            >
              {currentText}
              <span
                className={`inline-block w-[2px] h-[14px] ml-[1px] align-middle ${
                  cursorVisible ? 'bg-brand-400' : 'bg-transparent'
                }`}
              />
            </span>
          </div>
        )}

        {/* Idle cursor (when pausing between scenarios) */}
        {!currentText && !isTyping && visibleLines.length === 0 && !fading && (
          <div className="flex gap-3">
            <span className="text-purple-400 shrink-0">human</span>
            <span>
              <span
                className={`inline-block w-[2px] h-[14px] align-middle ${
                  cursorVisible ? 'bg-brand-400' : 'bg-transparent'
                }`}
              />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}



