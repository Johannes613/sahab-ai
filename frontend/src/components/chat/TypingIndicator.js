import React, { useEffect, useState } from 'react';

// The whole pipeline is one backend call, so this cycles through the agents to show
// the sequence rather than reflecting real progress.
export default function TypingIndicator({ agents }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!agents || agents.length < 2) return undefined;
    const t = setInterval(() => setI((n) => Math.min(n + 1, agents.length - 1)), 1800);
    return () => clearInterval(t);
  }, [agents]);

  const current = (agents && agents[i]) || 'Agents';
  return (
    <div className="flex items-center gap-3 py-3" role="status" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2].map((n) => (
          <span
            key={n}
            className="w-2 h-2 rounded-full bg-accent"
            style={{ animation: 'bounce 1.2s infinite', animationDelay: `${n * 0.2}s` }}
          />
        ))}
      </div>
      <span className="text-xs text-[var(--text-muted)]">{current} is working…</span>
    </div>
  );
}
