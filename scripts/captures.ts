import { runCaptures } from './lib/captures.ts';

process.exitCode = await runCaptures(process.argv.slice(2));
