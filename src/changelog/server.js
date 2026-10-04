import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { inspectRepository } from './git.js';
import { generateChangelog } from './generate.js';
const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');

export function createChangelogServer({ root = process.cwd(), roots = [] } = {}) {
  const repositories = new Map();
  for (const directory of new Set([root, ...roots])) {
    try { const repo = inspectRepository(directory); repositories.set(repo.path, repo); } catch {}
  }
  return http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const expectedHost = `127.0.0.1:${res.socket.localPort}`;
      if (req.headers.host !== expectedHost || (req.headers.origin && req.headers.origin !== `http://${expectedHost}`)) return json(403, { error: 'Use the local dashboard address printed by ctxlab.' });
      const url = new URL(req.url, `http://${expectedHost}`);
      if (req.method === 'GET' && url.pathname === '/api/repositories') return json(200, { repositories: [...repositories.values()] });
      if (req.method === 'GET' && url.pathname === '/api/directories') {
        const directory = await fs.realpath(url.searchParams.get('path') || root);
        const entries = await fs.readdir(directory, { withFileTypes: true });
        const folders = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => ({ name: entry.name, path: path.join(directory, entry.name) })).sort((a,b) => a.name.localeCompare(b.name));
        return json(200, { path: directory, parent: path.dirname(directory), home: os.homedir(), folders });
      }
      if (req.method === 'POST') {
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') return json(415, { error: 'JSON required.' });
        let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 100000) return json(413, { error: 'Request too large.' }); }
        const input = JSON.parse(body);
        if (url.pathname === '/api/repositories') { const repo = inspectRepository(input.path); repositories.set(repo.path, repo); return json(200, repo); }
        if (url.pathname === '/api/generate') {
          if (!Array.isArray(input.projects) || input.projects.length > 20) return json(400, { error: 'Select between 1 and 20 repositories.' });
          const projects = await Promise.all(input.projects.map(async project => ({ ...project, path: await fs.realpath(project.path) })));
          if (projects.some(project => !repositories.has(project.path))) return json(400, { error: 'Add each repository before generating.' });
          return json(200, generateChangelog({ ...input, projects }));
        }
      }
      const file = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' }[url.pathname];
      if (req.method !== 'GET' || !file) return json(404, { error: 'Not found.' });
      const content = await fs.readFile(path.join(assets, file));
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
      res.end(content);
    } catch (error) { json(400, { error: error.message || 'Could not complete the request.' }); }
  });
}
export function startChangelogDashboard(options = {}) {
  const server = createChangelogServer(options);
  server.on('error', error => { console.error(`ctxlab changelog: ${error.message}`); process.exitCode = 1; });
  server.listen(options.port ?? 4319, '127.0.0.1', () => console.log(`Changelog workspace: http://127.0.0.1:${server.address().port}\nPress Ctrl+C to stop.`));
  return server;
}
