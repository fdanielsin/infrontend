import { z } from 'zod';

// Zod 4 probes `new Function('')` to compile faster parsers. Under a Content-Security-Policy without
// 'unsafe-eval' the probe throws, zod catches it, but the browser still reports a violation (and
// logs a console error) on every page. The payloads here are small: parse without compiling.
// Imported first by every module that creates zod schemas, so that it runs before they are built.

z.config({ jitless: true });
