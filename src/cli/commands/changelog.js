import fs from 'node:fs';
import path from 'node:path';
import { generateChangelog } from '../../changelog/generate.js';
import { startChangelogDashboard } from '../../changelog/server.js';
import { writeClipboard } from '../terminal.js';

export function handleChangelogCommand(argv, root) {
  const options = { projects: [], calendar: 'gregorian' };
  let from, to = 'HEAD', toProvided = false, count, version, format = 'markdown', output, copy = false, ui = false, port = 4319;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { if (!argv[++i]) throw Error(`Missing value for ${arg}`); return argv[i]; };
    if (arg === '--help' || arg === '-h') {
      console.log('ctxlab changelog [repositories...] [options]\n\n  --ui                   Open a local changelog workspace (prints URL)\n  --port <number>        Dashboard port (default: 4319)\n  --from <ref> --to <ref> Generate one Git range\n  --releases <count>     Generate the latest tagged releases\n  --title <text>         Document heading\n  --release <text>       Version label\n  --calendar <name>      gregorian, persian-en, persian-fa\n  --include-internal     Include maintenance and tooling commits\n  --format <md|json>     Export format\n  --output, -o <file>    Save output to a file\n  --copy                 Copy output to the clipboard'); return;
    }
    if (arg === '--ui') ui = true;
    else if (arg === '--port') port = Number(next());
    else if (arg === '--from') from = next();
    else if (arg === '--to') { to = next(); toProvided = true; }
    else if (arg === '--releases') count = Number(next());
    else if (arg === '--title') options.title = next();
    else if (arg === '--release') version = next();
    else if (arg === '--calendar') options.calendar = next();
    else if (arg === '--include-internal') options.includeInternal = true;
    else if (arg === '--format') format = next();
    else if (arg === '--output' || arg === '-o') output = next();
    else if (arg === '--copy') copy = true;
    else if (arg === '--stdout') { /* default output */ }
    else if (arg.startsWith('-')) throw Error(`Unknown changelog option: ${arg}`);
    else options.projects.push({ path: path.resolve(root, arg) });
  }
  if (!['markdown', 'md', 'json'].includes(format)) throw Error('Format must be md or json.');
  if (toProvided && from === undefined) throw Error('Use --from with --to to select a reference range.');
  if (count !== undefined && from !== undefined) throw Error('Choose either --from or --releases.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid dashboard port.');
  if (ui) return startChangelogDashboard({ root: options.projects[0]?.path || root, roots: options.projects.map(project => project.path), port });
  if (!options.projects.length) options.projects.push({ path: root });
  options.projects = options.projects.map(project => ({ ...project, mode: count !== undefined ? 'releases' : from !== undefined ? 'range' : 'unreleased', from, to, count, version }));
  const result = generateChangelog(options);
  const rendered = format === 'json' ? JSON.stringify(result, null, 2) + '\n' : result.markdown;
  if (output) { fs.writeFileSync(path.resolve(root, output), rendered, 'utf8'); console.error(`Saved changelog to ${output}`); }
  if (copy && !writeClipboard(rendered)) throw Error('Clipboard unavailable. Use --output or --stdout.');
  if (!output && !copy) process.stdout.write(rendered);
  return result;
}
