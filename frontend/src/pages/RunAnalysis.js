import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { XCircle } from 'lucide-react';
import { runAnalysis, cancelRun } from '../api/sahab';
import { useRun } from '../context/RunContext';
import { useCityCatalog } from '../hooks/useCity';
import { useRunStatus } from '../hooks/useRunStatus';
import RunForm from '../components/run/RunForm';
import ProgressBar from '../components/run/ProgressBar';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

export default function RunAnalysis() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Chat deep links: /run?city=Riyadh&bbox=46.55,24.55,46.85,24.85&epsg=32638 or /run?run_id=...
  const initial = useMemo(() => {
    const city = searchParams.get('city');
    const parts = (searchParams.get('bbox') || '').split(',').map(Number);
    const bbox = parts.length === 4 && parts.every(Number.isFinite) && parts[0] < parts[2] && parts[1] < parts[3]
      ? parts : null;
    const epsg = parseInt(searchParams.get('epsg') || '', 10);
    return city || bbox ? { city, bbox, epsg: Number.isFinite(epsg) ? epsg : null } : null;
  }, [searchParams]);
  const { setRunId } = useRun();
  const catalog = useCityCatalog();
  const [activeRun, setActiveRun] = useState(searchParams.get('run_id'));
  const [busy, setBusy] = useState(false);
  const status = useRunStatus(activeRun);

  useEffect(() => {
    if (status?.status === 'complete') {
      setRunId(activeRun);
      toast.success('Analysis complete');
      navigate(`/?run=${encodeURIComponent(activeRun)}`);
    }
  }, [status, activeRun, setRunId, navigate]);

  const reset = () => {
    setActiveRun(null);
    if (searchParams.get('run_id')) setSearchParams({}, { replace: true });
  };

  const start = async (payload) => {
    setBusy(true);
    try {
      const res = await runAnalysis(payload);
      setActiveRun(res.run_id);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(
        typeof detail === 'string' ? detail
          : Array.isArray(detail) ? detail.map((d) => d.msg).join('; ')
          : 'Could not start the analysis'
      );
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    try {
      await cancelRun(activeRun);
    } catch (err) {
      /* the run may already be gone */
    }
    reset();
    toast('Run cancelled');
  };

  if (activeRun) {
    const ended = status && ['failed', 'cancelled'].includes(status.status);
    return (
      <div className="max-w-xl mx-auto">
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">Running analysis</h2>
          <ProgressBar status={status} />
          {status?.status === 'failed' && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg dark:bg-red-900/20 dark:border-red-900 dark:text-red-300">
              {status.message}
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            {ended ? (
              <Button variant="secondary" onClick={reset}>Back to form</Button>
            ) : (
              <Button variant="danger" size="sm" onClick={cancel}>
                <XCircle size={14} /> Cancel run
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Run analysis</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Pick an area and a Tanager scene. A run takes about 2 to 4 minutes, plus the first download of each scene (about 1 GB).
        </p>
      </div>
      <RunForm catalog={catalog} onSubmit={start} busy={busy} initial={initial} />
    </div>
  );
}
