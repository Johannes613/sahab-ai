import React from 'react';
import { User, Satellite, AlertCircle } from 'lucide-react';
import AgentBadge from './AgentBadge';
import CityCard from './CityCard';
import ActionLink from './ActionLink';

export default function ChatBubble({ msg, onFollowup }) {
  const isUser = msg.role === 'user';
  const cards = [msg.data, ...(msg.extra_data || [])].filter(Boolean);
  const fallbackNote = msg.warnings && msg.warnings.length > 0 ? msg.warnings[0] : null;

  return (
    <div className={`flex items-start gap-3 mb-5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white ${
          isUser ? 'bg-accent' : 'bg-green-600'
        }`}
      >
        {isUser ? <User size={17} /> : <Satellite size={17} />}
      </div>

      <div className="min-w-0 max-w-[80%]">
        {!isUser && msg.agents_used && msg.agents_used.length > 0 && (
          <div className="mb-1.5">
            {msg.agents_used.map((a) => <AgentBadge key={a} agent={a} />)}
          </div>
        )}

        <div
          className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-accent text-white rounded-2xl rounded-tr-sm'
              : 'bg-[var(--surface)] text-[var(--text-main)] border border-[var(--border)] rounded-2xl rounded-tl-sm'
          }`}
        >
          {msg.narrative || msg.content}
        </div>

        {fallbackNote && (
          <p className="mt-1.5 flex items-start gap-1 text-[11px] text-[var(--text-muted)]">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            Gemini was not used for part of this answer: {fallbackNote}
          </p>
        )}

        {cards.map((d) => <CityCard key={d.city} data={d} />)}

        {msg.links && msg.links.length > 0 && (
          <div className="mt-2">
            {msg.links.map((link) => <ActionLink key={link.url} link={link} />)}
          </div>
        )}

        {msg.followup_questions && msg.followup_questions.length > 0 && onFollowup && (
          <div className="mt-2">
            <div className="text-[11px] text-[var(--text-muted)] mb-1">Suggested questions</div>
            {msg.followup_questions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onFollowup(q)}
                className="mr-1.5 mb-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-accent/50 hover:text-accent transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
