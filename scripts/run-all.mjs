#!/usr/bin/env node
/**
 * Runs every built service as its own process (like separate containers), prefixing logs.
 *   npm run start:all       all services on their usual ports
 *   npm run start:traced    same, with OpenTelemetry traces to Jaeger (http://localhost:16686)
 * Build first (npm run build) and start the infrastructure (npm run infra:up).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const traced = process.argv.includes('--traced');
const root = new URL('..', import.meta.url).pathname;
const colours = [31, 32, 33, 34, 35, 36, 91, 92];

const node = ['identity', 'catalog', 'orders', 'payments', 'fulfillment', 'engagement', 'gateway'];
const services = node.map((name) => ({
  name,
  cmd: process.execPath,
  args: [
    ...(traced ? ['--import', '@opentelemetry/auto-instrumentations-node/register'] : []),
    `services/${name}/dist/main.js`,
  ],
  ready: existsSync(`${root}services/${name}/dist/main.js`),
}));
services.push({
  name: 'ai',
  cmd: `${root}services/ai/.venv/bin/${traced ? 'opentelemetry-instrument' : 'uvicorn'}`,
  args: traced
    ? [`${root}services/ai/.venv/bin/uvicorn`, 'app.main:app', '--port', '8000']
    : ['app.main:app', '--port', '8000'],
  cwd: `${root}services/ai`,
  ready: existsSync(`${root}services/ai/.venv`),
});

const children = [];
services.forEach((svc, i) => {
  if (!svc.ready) {
    console.warn(`skipping ${svc.name}: not built`);
    return;
  }
  const env = {
    ...process.env,
    ...(traced && {
      OTEL_SERVICE_NAME: svc.name,
      OTEL_EXPORTER_OTLP_ENDPOINT:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
      OTEL_TRACES_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
      OTEL_METRICS_EXPORTER: 'none',
      OTEL_LOGS_EXPORTER: 'none',
      OTEL_NODE_DISABLED_INSTRUMENTATIONS: 'fs,dns,net',
    }),
  };
  const child = spawn(svc.cmd, svc.args, { cwd: svc.cwd ?? root, env });
  const prefix = `\x1b[${colours[i % colours.length]}m${svc.name.padEnd(11)}\x1b[0m│ `;
  const pipe = (stream, out) =>
    stream.on('data', (chunk) => {
      for (const line of String(chunk).split('\n')) if (line) out.write(prefix + line + '\n');
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => console.log(`${prefix}exited (${code})`));
  children.push(child);
});

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
