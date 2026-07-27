#!/usr/bin/env node
import { parseCli, toDevServerArgs } from './parse.js';
import { printHelp, printVersion } from './help.js';
import { runBuild } from './commands/build.js';
import { runStart } from './commands/start.js';
import { runVerify } from './commands/verify.js';
import { runCompile } from './commands/compile.js';
import { runInit } from './commands/init.js';
import { runDevApp } from './commands/devApp.js';
import { runPrebuildCommand } from './commands/prebuild.js';
import { runServe } from './commands/serve.js';
import { runDoctor, checkNodeVersion, NODE_MIN_MAJOR, NODE_MAX_TESTED_MAJOR } from './commands/doctor.js';
import { runMigrate } from './commands/migrate.js';

async function main(): Promise<void> {
  const flags = parseCli(process.argv.slice(2));

  if (flags.version) {
    printVersion();
    return;
  }
  if (flags.help || flags.command === 'help') {
    printHelp();
    return;
  }

  // Enforce the supported Node range at the one point every command passes
  // through. npm's `engines` check is only a passive EBADENGINE warning that's
  // easy to miss, and it doesn't catch a Node switch after install.
  const node = checkNodeVersion();
  if (!node.ok) {
    console.error(
      `✗ Node.js ${node.version} is too old. Rayact requires Node >=${NODE_MIN_MAJOR} ` +
        `(e.g. \`nvm use ${NODE_MAX_TESTED_MAJOR}\`).`
    );
    process.exit(1);
  }
  if (node.untested && !process.env.RAYACT_SILENCE_NODE_WARNING) {
    // Newer majors are allowed through: blocking them would brick working
    // projects on every Node release. Set RAYACT_SILENCE_NODE_WARNING=1 to hide.
    console.warn(
      `! Node.js ${node.version} is newer than the latest version Rayact was tested ` +
        `against (${NODE_MAX_TESTED_MAJOR}.x). Proceeding — report anything that breaks.`
    );
  }

  try {
    switch (flags.command) {
      case 'dev': {
        const { startDevTui } = await import('@rayact/dev-server');
        await startDevTui(toDevServerArgs(flags));
        break;
      }
      case 'start':
      case 'run':
        await runStart(flags);
        break;
      case 'build':
      case 'export':
        await runBuild(flags);
        break;
      case 'compile':
        await runCompile(flags);
        break;
      case 'verify':
        runVerify(flags);
        break;
      case 'init':
        runInit(flags);
        break;
      case 'dev-app':
        await runDevApp(flags);
        break;
      case 'prebuild':
        await runPrebuildCommand(flags);
        break;
      case 'serve':
        await runServe(flags);
        break;
      case 'doctor':
        runDoctor();
        break;
      case 'migrate':
        await runMigrate();
        break;
      default:
        console.error(`Unknown command: ${flags.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  }
}

main();
