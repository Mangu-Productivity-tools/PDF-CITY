import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const conversionJobsStarted = new client.Counter({
  name: 'conversion_jobs_started_total',
  help: 'Total conversion jobs picked up by a worker',
  registers: [register],
});

export const conversionJobsFailed = new client.Counter({
  name: 'conversion_jobs_failed_total',
  help: 'Total conversion jobs that reached a terminal failure',
  labelNames: ['error_code'],
  registers: [register],
});

export const conversionJobsProcessed = new client.Counter({
  name: 'conversion_jobs_processed_total',
  help: 'Total conversion jobs completed successfully',
  registers: [register],
});

export const conversionJobDuration = new client.Histogram({
  name: 'conversion_jobs_duration_seconds',
  help: 'Wall-clock time to convert one EPUB, in seconds',
  buckets: [1, 5, 15, 30, 45, 60, 120, 300, 600, 1200],
  registers: [register],
});

export const activeJobsGauge = new client.Gauge({
  name: 'active_jobs',
  help: 'Jobs currently being processed by this worker process',
  registers: [register],
});

export const engineUsageCounter = new client.Counter({
  name: 'engine_usage_total',
  help: 'Conversion jobs by rendering engine',
  labelNames: ['engine'],
  registers: [register],
});

export const renderingMemoryBytesGauge = new client.Gauge({
  name: 'rendering_memory_bytes',
  help: 'Resident set size of the worker process, sampled after each job',
  registers: [register],
});

export { register };
