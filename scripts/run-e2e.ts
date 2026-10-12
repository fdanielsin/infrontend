import { runE2e } from './lib/e2e.ts';

process.exitCode = await runE2e(process.argv.slice(2));
