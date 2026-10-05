import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, MapPin, Play, Filter, Link2 } from 'lucide-react';

// Deep links open the dashboard or run page pre-configured through query parameters.
const STYLES = {
  dashboard: { cls: 'bg-accent hover:bg-accent-hover', Icon: Map },
  block: { cls: 'bg-green-600 hover:bg-green-700', Icon: MapPin },
  run: { cls: 'bg-orange-600 hover:bg-orange-700', Icon: Play },
  filter: { cls: 'bg-purple-600 hover:bg-purple-700', Icon: Filter },
};

export default function ActionLink({ link }) {
  const navigate = useNavigate();
  const { cls, Icon } = STYLES[link.type] || { cls: 'bg-gray-600 hover:bg-gray-700', Icon: Link2 };
  return (
    <button
      type="button"
      onClick={() => navigate(link.url)}
      className={`inline-flex items-center gap-1.5 mr-2 mb-2 px-3 py-2 rounded-lg text-xs font-medium text-white transition-all focus:outline-none focus:ring-2 focus:ring-accent/40 ${cls}`}
    >
      <Icon size={14} /> {link.label}
    </button>
  );
}
