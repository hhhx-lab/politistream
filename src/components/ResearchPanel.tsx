import React, { useEffect, useState } from 'react';
import { ArrowLeft, Play, RefreshCw } from 'lucide-react';
import {
  ResearchDocumentsResponse,
  ResearchDocumentSummary,
  ResearchJobSummary,
  ResearchReportSummary,
  ResearchRunResponse,
} from '../types';

interface ResearchPanelProps {
  selectedJobId?: string;
  onSelectedJobChange?: (id: string | undefined) => void;
  onBackToSearch?: () => void;
}

export const ResearchPanel: React.FC<ResearchPanelProps> = ({
  selectedJobId,
  onSelectedJobChange,
  onBackToSearch,
}) => {
  const [jobs, setJobs] = useState<ResearchJobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<ResearchJobSummary | null>(null);
  const [topic, setTopic] = useState('');
  const [report, setReport] = useState<ResearchReportSummary | null>(null);
  const [documents, setDocuments] = useState<ResearchDocumentSummary[]>([]);
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/research/jobs');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setJobs(data);
      setMessage('');
      return data as ResearchJobSummary[];
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return [];
    }
  };

  const loadJobArtifacts = async (job: ResearchJobSummary) => {
    setSelectedJob(job);
    onSelectedJobChange?.(job.id);
    await Promise.all([loadReport(job.id), loadDocuments(job.id)]);
  };

  const loadReport = async (jobId: string) => {
    try {
      const res = await fetch(`/api/research/jobs/${jobId}/report`);
      const data = await res.json();
      setReport(data);
    } catch (error) {
      setReport({ jobId, status: 'failed', markdown: String(error) });
    }
  };

  const loadDocuments = async (jobId: string) => {
    try {
      const res = await fetch(`/api/research/jobs/${jobId}/documents`);
      const data = await res.json() as ResearchDocumentsResponse;
      if (!res.ok) throw new Error((data as any).message || (data as any).error || `HTTP ${res.status}`);
      setDocuments(data.documents ?? []);
    } catch {
      setDocuments([]);
    }
  };

  const createAndRunJob = async () => {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) return;
    setRunning(true);
    setMessage('');
    try {
      const res = await fetch('/api/research/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: normalizedTopic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setTopic('');
      await runJob(data.id);
      await loadJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  const runJob = async (jobId = selectedJob?.id) => {
    if (!jobId) return;
    setRunning(true);
    setMessage('');
    try {
      const res = await fetch(`/api/research/jobs/${jobId}/run`, { method: 'POST' });
      const data = await res.json() as ResearchRunResponse;
      if (!res.ok && res.status !== 202) throw new Error((data as any).message || (data as any).error || `HTTP ${res.status}`);
      setSelectedJob(data.job);
      setReport(data.report);
      setMessage(data.message || (data.success ? '' : 'Research run finished with limited evidence.'));
      await loadDocuments(data.job.id);
      await loadJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    loadJobs().then((loadedJobs) => {
      const selected = selectedJobId ? loadedJobs.find((job) => job.id === selectedJobId) : loadedJobs[0];
      if (selected) {
        loadJobArtifacts(selected);
      }
    });
  }, [selectedJobId]);

  return (
    <div className="h-full flex bg-[#E4E3E0] text-[#141414]">
      <div className="w-96 border-r border-[#141414] bg-[#F5F5F4] flex flex-col">
        <div className="p-4 border-b border-stone-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onBackToSearch && (
              <button className="p-2 hover:bg-stone-200 rounded" onClick={onBackToSearch} title="Back to search">
                <ArrowLeft size={16} />
              </button>
            )}
            <h2 className="font-serif italic text-stone-600 truncate">Research Jobs</h2>
          </div>
          <button className="p-2 hover:bg-stone-200 rounded" onClick={loadJobs} title="Refresh jobs">
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="p-4 border-b border-stone-300 space-y-3">
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Research topic"
            className="w-full border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={createAndRunJob}
            disabled={running || !topic.trim()}
            className="w-full flex items-center justify-center gap-2 bg-stone-900 text-stone-100 px-3 py-2 text-sm disabled:opacity-50"
          >
            <Play size={14} />
            {running ? 'Running' : 'Create & Run'}
          </button>
          {message && <p className="text-xs text-rose-700 font-mono">{message}</p>}
        </div>
        <div className="overflow-y-auto">
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => loadJobArtifacts(job)}
              className={`w-full text-left p-4 border-b border-stone-300 hover:bg-stone-100 ${selectedJob?.id === job.id ? 'bg-stone-200' : ''}`}
            >
              <div className="font-serif text-lg leading-tight">{job.topic}</div>
              <div className="font-mono text-[10px] uppercase mt-2 opacity-50">{job.status} / depth {job.budget.maxDepth}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 lg:p-10 overflow-y-auto">
        {selectedJob ? (
          <div className="max-w-5xl">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-4">Job {selectedJob.id}</div>
                <h1 className="font-serif text-4xl mb-3">{selectedJob.topic}</h1>
                <div className="font-mono text-xs uppercase opacity-60">{selectedJob.status}</div>
              </div>
              <button
                onClick={() => runJob(selectedJob.id)}
                disabled={running}
                className="flex items-center justify-center gap-2 bg-stone-900 text-stone-100 px-4 py-2 text-sm disabled:opacity-50"
              >
                <Play size={14} />
                {running ? 'Running' : 'Run Again'}
              </button>
            </div>

            <div className="grid md:grid-cols-4 gap-3 mb-8">
              <Metric label="Depth" value={selectedJob.budget.maxDepth} />
              <Metric label="URLs" value={selectedJob.budget.maxUrlsPerRun} />
              <Metric label="Domains" value={selectedJob.budget.maxDomainsPerRun} />
              <Metric label="Docs" value={documents.length} />
            </div>

            <div className="grid lg:grid-cols-[1fr_20rem] gap-6">
              <div className="border border-[#141414] p-6 bg-stone-100">
                <h3 className="font-serif italic text-xl mb-4">Latest Report</h3>
                {report?.markdown ? (
                  <pre className="whitespace-pre-wrap text-sm leading-6 font-sans">{report.markdown}</pre>
                ) : (
                  <p className="font-mono text-sm opacity-60">Report is not ready yet.</p>
                )}
              </div>

              <div className="border border-stone-300 bg-stone-100 p-4">
                <h3 className="font-serif italic text-lg mb-3">Documents</h3>
                <div className="space-y-3">
                  {documents.length === 0 ? (
                    <p className="font-mono text-xs opacity-60">No documents recorded yet.</p>
                  ) : (
                    documents.slice(0, 12).map((document) => (
                      <a
                        key={document.id}
                        href={document.finalUrl || document.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block border-b border-stone-300 pb-3 last:border-b-0"
                      >
                        <div className="font-mono text-[10px] uppercase opacity-50">{document.status} / {document.domain}</div>
                        <div className="text-sm leading-snug mt-1">{document.title || document.url}</div>
                        {document.error && <div className="text-xs text-rose-700 mt-1">{document.error}</div>}
                      </a>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center opacity-30">
            <div className="text-center">
              <div className="text-5xl font-serif italic mb-3">Research</div>
              <div className="font-mono text-sm">Create or select a research job</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="border border-stone-300 bg-stone-100 p-3">
    <div className="font-mono text-[10px] uppercase opacity-50">{label}</div>
    <div className="font-serif text-xl">{value}</div>
  </div>
);
