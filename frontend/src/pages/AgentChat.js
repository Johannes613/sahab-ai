import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Bot, Send } from 'lucide-react';
import ChatBubble from '../components/chat/ChatBubble';
import TypingIndicator from '../components/chat/TypingIndicator';
import { sendChatMessage } from '../api/agentChat';

const STARTER_PROMPTS = [
  'Analyze heat risk in Dubai, UAE',
  'Which blocks in Riyadh need cool roofs most urgently?',
  'Compare tree planting opportunities in Cairo',
  'Show me the hottest areas in Abu Dhabi',
  'Where should Muscat plant trees first?',
];

const PIPELINE = ['Gemini (intent)', 'Sahab AI pipeline (data)', 'Gemini (insight)', 'Link Builder'];

const WELCOME_MESSAGE = {
  isWelcome: true,
  role: 'assistant',
  narrative:
    'Welcome to Sahab AI Agent Chat. Four agents work together on every question:\n\n' +
    '1. Gemini reads your question and finds the city coordinates.\n' +
    '2. The Sahab AI pipeline provides the heat risk data.\n' +
    '3. Gemini explains the results in plain language.\n' +
    '4. The Link Builder gives you direct links into the dashboard.\n\n' +
    'Ask about heat risk, tree planting priorities, cool roof opportunities or surface ' +
    'temperatures in any Arab League country. Cities without a completed analysis show ' +
    'clearly labelled simulated data.',
  agents_used: [],
  links: [],
  data: null,
  followup_questions: [],
};

export default function AgentChat() {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Drop the welcome text and anything empty so stale context is never sent to the model.
  const buildHistory = useCallback(
    (msgs) =>
      msgs
        .filter((m) => !m.isWelcome && !m.isError)
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: (m.role === 'user' ? m.content : m.narrative) || '',
        }))
        .filter((m) => m.content.trim()),
    []
  );

  const sendMessage = useCallback(
    async (text) => {
      const clean = text.trim();
      if (!clean || loading) return;
      const history = buildHistory(messages);
      setMessages((prev) => [...prev, { role: 'user', content: clean }]);
      setInput('');
      setLoading(true);
      try {
        const res = await sendChatMessage(clean, history, sessionId);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            narrative: res.narrative,
            agents_used: res.agents_used,
            data: res.data,
            extra_data: res.extra_data,
            links: res.links,
            followup_questions: res.followup_questions,
            intent: res.intent,
            warnings: res.warnings,
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            isError: true,
            narrative: err.message,
            agents_used: [],
            links: [],
            data: null,
            followup_questions: [],
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, sessionId, buildHistory]
  );

  return (
    <div className="flex flex-col max-w-3xl mx-auto" style={{ height: 'calc(100vh - 7.5rem)' }}>
      <div className="pb-3 border-b border-[var(--border)]">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Bot size={22} className="text-accent" /> Sahab AI Agent Chat
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Intent, data, insight and link agents working together
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-5 pr-1">
        {messages.map((msg, i) => (
          <ChatBubble key={i} msg={msg} onFollowup={sendMessage} />
        ))}
        {loading && <TypingIndicator agents={PIPELINE} />}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div className="pb-3 flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => sendMessage(p)}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs text-[var(--text-muted)] hover:border-accent/50 hover:text-accent transition-all"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2 pt-3 border-t border-[var(--border)]"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about heat risk in any Arab city..."
          disabled={loading}
          aria-label="Message"
          className="flex-1 px-4 py-3 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-main)] text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Send size={15} /> Send
        </button>
      </form>
    </div>
  );
}
