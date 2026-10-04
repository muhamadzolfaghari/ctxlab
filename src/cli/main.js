import { handleChangelogCommand } from "./commands/changelog.js";
import { parseArgs, printHelp, printTargets } from "./args.js";
import { handlePackCommand } from "./commands/pack.js";
import { handleApplyCommand } from "./commands/apply.js";
import { handleRevertCommand } from "./commands/revert.js";
import { startInteractive } from "./tui/interactive.js";

const DEFAULT_VERSION = "1.3.0";

export function runCli(argv, version, root) {
  const ROOT = root || process.cwd();
  const currentVersion = version || DEFAULT_VERSION;
  if (argv[0] === "changelog") return handleChangelogCommand(argv.slice(1), ROOT);
  const options = parseArgs(argv, ROOT);

  if (options.help) {
    printHelp(currentVersion);
    return;
  }
  if (options.version) {
    console.log(currentVersion);
    return;
  }
  if (options.listTargets) {
    printTargets(currentVersion);
    return;
  }

  if (options.command === "apply") {
    handleApplyCommand(options.applySource || "clipboard", options, ROOT);
    return;
  }

  if (options.command === "revert") {
    handleRevertCommand(options.revertTimestamp, ROOT);
    return;
  }

  if (options.command === "dump" || options.restore || argv.length > 0) {
    handlePackCommand(options, ROOT);
    return;
  }

  startInteractive(options, ROOT, currentVersion);
}
