import { runApi } from './lib/api.ts';

process.exitCode = await runApi(process.argv.slice(2));
