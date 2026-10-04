import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseCommit } from './format.js';

function git(root, args) {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { throw new Error('Could not read Git history. Check the repository and selected references.'); }
}
export function inspectRepository(directory) {
  const root = fs.realpathSync(path.resolve(directory));
  const repoPath = git(root, ['rev-parse', '--show-toplevel']);
  let name = path.basename(repoPath);
  try { name = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8')).name || name; } catch {}
  return {
    path: repoPath, name: String(name).replace(/^@[^/]+\//, ''),
    branch: git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']),
    tags: git(repoPath, ['tag', '--sort=-version:refname']).split('\n').filter(Boolean),
    branches: git(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes']).split('\n').filter(Boolean),
  };
}
export function resolveRef(root, ref) {
  if (typeof ref !== 'string' || !ref.trim() || ref.length > 256 || ref.startsWith('-') || /[\r\n\0]/.test(ref)) throw new Error('Invalid Git reference.');
  return git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
}
export function readCommits(root, from, to = 'HEAD') {
  const target = resolveRef(root, to);
  const range = from ? `${resolveRef(root, from)}..${target}` : target;
  const output = git(root, ['log', range, '--no-merges', '--format=%H%x00%s%x00%b%x00']);
  if (!output) return [];
  const fields = output.split('\0');
  const commits = [];
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const hash = fields[i].trim(), subject = fields[i + 1], description = fields[i + 2];
    const parsed = parseCommit(subject);
    commits.push({ hash, subject, type: parsed?.type || null, scope: parsed?.scope || '', body: parsed?.body ?? subject,
      breaking: /^\w+(?:\([^)]*\))?!:/.test(subject) || /BREAKING[ -]CHANGE:/.test(description) });
  }
  return commits;
}
