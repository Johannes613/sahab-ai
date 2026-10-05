import React, { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { getSceneInfo } from '../../api/sahab';

// Shows the Tanager thumbnail for a scene ID so users can confirm the scene
// before running the full analysis.
export default function SceneThumb({ sceneId }) {
  const [state, setState] = useState({ status: 'idle' });
  const id = sceneId.trim();

  useEffect(() => {
    if (id.length < 6) {
      setState({ status: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    const timer = setTimeout(() => {
      getSceneInfo(id)
        .then((info) => !cancelled && setState({ status: 'ok', info }))
        .catch(() => !cancelled && setState({ status: 'error' }));
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (state.status === 'idle') return null;

  return (
    <div className="mt-2">
      <div className="h-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden flex items-center justify-center text-xs text-[var(--text-muted)]">
        {state.status === 'loading' && <Loader2 size={18} className="animate-spin" />}
        {state.status === 'error' && (
          <span className="flex items-center gap-2"><ImageOff size={16} /> Scene not found</span>
        )}
        {state.status === 'ok' && (
          <img
            src={state.info.thumbnail_url}
            alt={`Thumbnail of scene ${id}`}
            className="w-full h-full object-cover"
          />
        )}
      </div>
      {state.status === 'ok' && state.info.acquired && (
        <p className="text-[11px] text-[var(--text-muted)] mt-1">Acquired {state.info.acquired}</p>
      )}
    </div>
  );
}
