import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runE2e } from '../../../scripts/lib/e2e.ts';
import { FakeRoot } from './fake-root.ts';

const ENV = { E2E_PORT: '4103', PUBLIC_API_URL: 'http://localhost:8089' };
const answering = vi.fn(() => Promise.resolve(new Response('ok', { status: 200 })));

describe('runE2e, the failures of the two passes (@alone)', () => {
	let root: FakeRoot;
	beforeEach(() => {
		root = new FakeRoot();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});
	afterEach(() => {
		root.remove();
		vi.restoreAllMocks();
	});

	it.each([
		['the main pass passes and the pass alone fails', '--grep=@alone', 7],
		['the main pass fails and the pass alone passes', '--grep-invert=@alone', 3]
	])('loses no failure when %s (sad path)', async (_name, failingFlag, code) => {
		const file = path.join(root.dir, 'node_modules', '.bin', 'playwright');
		writeFileSync(file, `#!/bin/sh\ncase "$*" in *${failingFlag}*) exit ${code};; esac\nexit 0\n`);
		chmodSync(file, 0o755);

		expect(await runE2e(['backend'], ENV, root.dir, answering)).toBe(code);
	});
});
