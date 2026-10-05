import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { XCircle } from 'lucide-react';
import { runAnalysis, cancelRun } from '../api/sahab';
import { useRun } from '../context/RunContext';
import { useCities } from '../hooks/useCity';
import { useRunStatus } from '../hooks/useRunStatus';
import RunForm from '../components/run/RunForm';
import ProgressBar from '../components/run/ProgressBar';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

export default function RunAnalysis() {
  const navigate = useNavigate();
  const { setRunId } = useRun();
  const { cities, reload } = useCities();
  const [activeRun, setActiveRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const status = useRunStatus(activeRun);

  useEffect(() => {
    if (status?.status === 'complete') {
      setRunId(activeRun);
      toast.success('Analysis complete');
      navigate('/');
    }
    if (status?.status === 'failed') {
      toast.error(status.message || 'Analysis failed');
    }
  }, [status, activeRun, setRunId, navigate]);

  const start = async (payload) => {
    setBusy(true);
    try {
      const res = await runAnalysis(payload);
      setActiveRun(res.run_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not start the analysis');
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
    setActiveRun(null);
    toast('Run cancelled');
  };

  if (activeRun) {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">Running analysis</h2>
          <ProgressBar status={status} />
          <div className="mt-6 flex justify-end gap-2">
            {status?.status === 'failed' && (
              <Button variant="secondary" onClick={() => setActiveRun(null)}>Back to form</Button>
            )}
            {status?.status !== 'failed' && (
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
          Pick an area and two Tanager scenes. The pipeline takes about 1 to 3 minutes.
        </p>
      </div>
      <RunForm cities={cities} onSubmit={start} busy={busy} onCityAdded={reload} />
    </div>
  );
}
