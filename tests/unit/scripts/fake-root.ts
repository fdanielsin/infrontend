import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = path.resolve('test-results', 'fake-roots');

/** A throwaway project root whose `node_modules/.bin` holds fake tools that log their run. */
export class FakeRoot {
	readonly dir: string;

	constructor() {
		mkdirSync(BASE, { recursive: true });
		this.dir = mkdtempSync(path.join(BASE, 'root-'));
		mkdirSync(path.join(this.dir, 'node_modules', '.bin'), { recursive: true });
	}

	/** Adds a tool that creates `<name>.ran` and exits with `code`. */
	tool(name: string, code: number): void {
		const file = path.join(this.dir, 'node_modules', '.bin', name);
		writeFileSync(file, `#!/bin/sh\ntouch "${this.dir}/${name}.ran"\nexit ${code}\n`);
		chmodSync(file, 0o755);
	}

	ran(name: string): boolean {
		return existsSync(path.join(this.dir, `${name}.ran`));
	}

	remove(): void {
		rmSync(this.dir, { recursive: true, force: true });
	}
}
