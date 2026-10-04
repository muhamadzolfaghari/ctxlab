import { inspectRepository, readCommits } from './git.js';
import { filterCommits, bulletFromCommit, formatChangelogDocument, tagToVersion } from './format.js';
import { formatPersianHeadline, formatGregorianHeadline } from './date.js';

export function generateChangelog({ projects, title, calendar = 'gregorian', includeInternal = false, date = new Date() } = {}) {
  if (!Array.isArray(projects) || !projects.length || projects.length > 20) throw new Error('Select between 1 and 20 repositories.');
  if (!['gregorian', 'persian-en', 'persian-fa'].includes(calendar)) throw new Error('Unsupported calendar.');
  const headline = title || `${calendar === 'gregorian' ? formatGregorianHeadline(date) : formatPersianHeadline(date, calendar === 'persian-fa' ? 'fa' : 'en')} — Changelog`;
  const stats = { repositories: projects.length, scanned: 0, included: 0, filtered: 0 };
  const sections = projects.map(project => {
    const repo = inspectRepository(project.path);
    const mode = project.mode || 'unreleased';
    if (!['unreleased', 'range', 'releases'].includes(mode)) throw new Error('Unsupported release mode.');
    let ranges;
    if (mode === 'range') {
      if (!project.from || !project.to) throw new Error('Choose both references for a range.');
      ranges = [{ from: project.from, to: project.to, version: project.version || `${project.from} → ${project.to}` }];
    } else if (mode === 'releases') {
      const count = Number(project.count ?? 1);
      if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Release count must be between 1 and 20.');
      if (!repo.tags.length) throw new Error(`${repo.name} has no release tags. Use Unreleased instead.`);
      ranges = repo.tags.slice(0, count).map((tag, i) => ({ from: repo.tags[i + 1] || '', to: tag, version: tagToVersion(tag) }));
    } else ranges = [{ from: repo.tags[0] || '', to: 'HEAD', version: project.version || 'Unreleased' }];
    return { name: project.name || repo.name, versions: ranges.map(range => {
      const commits = readCommits(repo.path, range.from, range.to);
      const included = includeInternal ? commits : filterCommits(commits);
      stats.scanned += commits.length;
      stats.included += included.length;
      stats.filtered += commits.length - included.length;
      return { version: range.version, bullets: included.map(commit => {
        const bullet = bulletFromCommit(commit);
        return commit.breaking && bullet ? `Breaking: ${bullet}` : bullet;
      }).filter(Boolean), commitCount: included.length };
    }) };
  });
  return { headline, projects: sections, stats, markdown: formatChangelogDocument(headline, sections) };
}
