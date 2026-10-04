// High performance, deterministic changelog parsing & formatting engine

export const EXCLUDED_TYPES = new Set([
  "chore", "build", "ci", "docs", "test", "style", "refactor", "perf", "revert"
]);

export const TYPE_LABELS = {
  feat: "Added",
  fix: "Fixed",
  improve: "Improved",
  improvement: "Improved",
  update: "Updated",
  updated: "Updated",
  enhance: "Enhanced",
  removed: "Removed",
  remove: "Removed",
  refactor: "Refactored",
};

export const TOOLING_SCOPE_RE =
  /\b(gitlab|husky|npmrc|eslint|prettier|docker|sentry|dependabot|coverage|pnpm|yarn)\b/i;

export const VERSION_BUMP_RE = /^v?\d+\.\d+\.\d+$/;

export function parseCommit(subject) {
  const m = subject.match(/^(\w+)(?:\(([^)]*)\))?!?:\s*(.*)$/);
  if (!m) return null;
  return {
    type: m[1].toLowerCase(),
    scope: (m[2] || "").toLowerCase(),
    body: m[3]
  };
}

export function humanizeScope(scope) {
  if (!scope) return "";
  return scope
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function filterCommits(commits) {
  const seen = new Set();
  return commits.filter((c) => {
    if (VERSION_BUMP_RE.test(c.subject.trim())) return false;
    const lc = c.subject.toLowerCase();
    if (lc.startsWith("merge ") || lc.includes("merge branch") || lc.includes("merged with")) {
      return false;
    }
    if (!c.breaking && c.type && EXCLUDED_TYPES.has(c.type)) return false;
    if (!c.breaking && c.scope && TOOLING_SCOPE_RE.test(c.scope)) return false;

    const key = c.body.trim().toLowerCase();
    if (!key) return false;
    const dedupeKey = `${c.scope}|${c.breaking ? "breaking|" : ""}${key}`;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
}

export function bulletFromCommit(c) {
  let body = (c.body || c.subject || "").trim();
  body = body.replace(/[.\s]+$/, "");
  if (!body) return null;

  body = body
    .replace(/\bcounries\b/gi, "countries")
    .replace(/\bcoutry\b/gi, "country")
    .replace(/\bhadle\b/gi, "handle")
    .replace(/\bbeter\b/gi, "better")
    .replace(/\beng name\b/gi, "english name")
    .replace(/\bsimType\b/gi, "sim type");
  body = body.replace(/\s{2,}/g, " ").trim();

  const label = TYPE_LABELS[c.type] || "Updated";
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  body = body.replace(
    /^(add|added|fix|fixed|resolve|resolved|avoid|avoided|introduce|introduced|create|created|move|moved|improve|improved|update|updated|enhance|enhanced|remove|removed|refactor|refactored)\s+/i,
    ""
  );

  body = body.replace(/\s+and also add\s+/i, ", ");
  body = body.replace(/\s+(?:has|have) been (?:fixed|added|handled|changed|removed|deleted|completed|disabled)\b.*$/i, "");
  body = body.replace(/\s+added (?:to|into|for|in|under)\b.*$/i, "");
  body = body.replace(/\s+added and\b.*$/i, "");
  body = body.replace(/\s+changed based on\b.*$/i, "");
  body = body.replace(/\s+changed to (?:the\s+)?[a-zA-Z0-9]+$/i, "");
  body = body.replace(/\s+removed from\b.*$/i, "");
  body = body.replace(/\s+handled (?:for|in|on)\b.*$/i, "");
  body = body.replace(/\s+(?:added|changed|fixed|handled|removed|deleted|disabled|completed)\s*$/i, "");

  body = body.replace(/\s{2,}/g, " ").trim();
  body = body.replace(/[.\s]+$/, "");
  if (!body) return null;

  body = body.replace(/^and\s+/i, "");

  const startsWithVerb = /^(added|fixed|improved|updated|enhanced|removed|refactored)\b/i.test(body);

  let bullet;
  if (startsWithVerb) {
    bullet = capitalize(body);
  } else {
    bullet = `${label} ${capitalize(body)}`;
  }

  const domain = humanizeScope(c.scope);
  return domain ? `${bullet} for ${domain}` : bullet;
}

export function tagToVersion(tag) {
  if (!tag) return "";
  return tag.replace(/^v(?=\d)/i, "").trim();
}

/**
 * Format a multi-project changelog adhering to:
 *
 * # headline
 * ---
 * ## project name
 * ### version
 * - changes
 * ### version
 * - changes
 * ---
 * ## project name
 * ### version
 * - changes
 */
export function formatChangelogDocument(headline, projectSections) {
  let doc = `# ${headline}\n---\n`;

  const validProjects = projectSections.filter(p => p && p.versions && p.versions.length > 0);

  const formattedProjects = validProjects.map(proj => {
    let projBlock = `## ${proj.name}\n`;

    const versionBlocks = proj.versions.map(ver => {
      let verHeader = `### ${ver.version}\n`;
      let items = ver.bullets && ver.bullets.length > 0
        ? ver.bullets.map(b => `- ${b}`).join("\n")
        : "- No user-facing changes documented.";
      return `${verHeader}${items}`;
    });

    projBlock += versionBlocks.join("\n\n");
    return projBlock;
  });

  doc += formattedProjects.join("\n\n---\n\n");
  return doc + "\n";
}
