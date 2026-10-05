import React from 'react';
import { Zap, Satellite, Brain, Link2, Bot, FileText, Search } from 'lucide-react';

// Which agent produced a piece of the answer. Fallback agents are shown in a muted
// style so it is obvious when Gemini was not used.
const AGENTS = {
  'Gemini (intent)': { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', Icon: Zap },
  'Keyword parser (intent)': { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', Icon: Search },
  'Sahab AI pipeline (data)': { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', Icon: Satellite },
  'Gemini (insight)': { cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', Icon: Brain },
  'Template (insight)': { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', Icon: FileText },
  'Link Builder': { cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', Icon: Link2 },
};

export default function AgentBadge({ agent }) {
  const { cls, Icon } = AGENTS[agent] || {
    cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    Icon: Bot,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 mr-1 mb-1 rounded-full text-[11px] font-medium ${cls}`}>
      <Icon size={11} /> {agent}
    </span>
  );
}
