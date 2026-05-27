import React, { useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { ResearchJobSummary, ResearchReportSummary } from '../types';

export const ResearchPanel: React.FC = () => {
  const [jobs, setJobs] = useState<ResearchJobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<ResearchJobSummary | null>(null);
  const [topic, setTopic] = useState('');
  const [report, setReport] = useState<ResearchReportSummary | null>(null);
  const [message, setMessage] = useState('');

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/research/jobs');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setJobs(data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const createJob = async () => {
    if (!topic.trim()) return;
    try {
      const res = await fetch('/api/research/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setTopic('');
      setSelectedJob(data);
      await loadJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const loadReport = async (job: ResearchJobSummary) => {
    setSelectedJob(job);
    try {
      const res = await fetch(`/api/research/jobs/${job.id}/report`);
      const data = await res.json();
      setReport(data);
    } catch (error) {
      setReport({ jobId: job.id, status: 'failed', markdown: String(error) });
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  return (
    <div className="h-full flex bg-[#E4E3E0] text-[#141414]">
      <div className="w-96 border-r border-[#141414] bg-[#F5F5F4] flex flex-col">
        <div className="p-4 border-b border-stone-300 flex items-center justify-between">
          <h2 className="font-serif italic text-stone-600">Research Jobs</h2>
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
            onClick={createJob}
            className="w-full flex items-center justify-center gap-2 bg-stone-900 text-stone-100 px-3 py-2 text-sm"
          >
            <Play size={14} />
            Create Job
          </button>
          {message && <p className="text-xs text-rose-700 font-mono">{message}</p>}
        </div>
        <div className="overflow-y-auto">
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => loadReport(job)}
              className={`w-full text-left p-4 border-b border-stone-300 hover:bg-stone-100 ${selectedJob?.id === job.id ? 'bg-stone-200' : ''}`}
            >
              <div className="font-serif text-lg leading-tight">{job.topic}</div>
              <div className="font-mono text-[10px] uppercase mt-2 opacity-50">{job.status} / depth {job.budget.maxDepth}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-10 overflow-y-auto">
        {selectedJob ? (
          <div className="max-w-4xl">
            <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-4">Job {selectedJob.id}</div>
            <h1 className="font-serif text-4xl mb-6">{selectedJob.topic}</h1>
            <div className="grid grid-cols-4 gap-3 mb-8">
              <Metric label="Depth" value={selectedJob.budget.maxDepth} />
              <Metric label="URLs" value={selectedJob.budget.maxUrlsPerRun} />
              <Metric label="Domains" value={selectedJob.budget.maxDomainsPerRun} />
              <Metric label="Interval" value={`${selectedJob.budget.runIntervalMinutes}m`} />
            </div>
            <div className="border border-[#141414] p-6 bg-stone-100">
              <h3 className="font-serif italic text-xl mb-4">Latest Report</h3>
              {report?.markdown ? (
                <pre className="whitespace-pre-wrap text-sm leading-6 font-sans">{report.markdown}</pre>
              ) : (
                <p className="font-mono text-sm opacity-60">Report is not ready yet.</p>
              )}
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
