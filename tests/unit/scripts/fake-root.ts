import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
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
		// Each run also appends its arguments to `<name>.runs`, one line per run.
		writeFileSync(
			file,
			`#!/bin/sh\ntouch "${this.dir}/${name}.ran"\necho "$@" >> "${this.dir}/${name}.runs"\nexit ${code}\n`
		);
		chmodSync(file, 0o755);
	}

	ran(name: string): boolean {
		return existsSync(path.join(this.dir, `${name}.ran`));
	}

	/** The arguments of each run of a tool, in order. */
	runs(name: string): string[] {
		const file = path.join(this.dir, `${name}.runs`);
		return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : [];
	}

	remove(): void {
		rmSync(this.dir, { recursive: true, force: true });
	}
}
