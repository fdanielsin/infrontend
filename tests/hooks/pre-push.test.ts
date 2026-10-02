// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const hooksDirectory = resolve(__dirname, '../../.githooks');
const workRoot = resolve(__dirname, '.tmp');

// A hook run by a Git hook inherits GIT_DIR, GIT_INDEX_FILE...: they would aim at the real repository.
const cleanEnvironment = Object.fromEntries(
	Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_') && name !== 'RELEASE_TAG')
);

let sandbox: string;
let repository: string;
let remote: string;

function git(cwd: string, ...args: string[]) {
	return execFileSync('git', args, { cwd, env: cleanEnvironment, encoding: 'utf8' }).trim();
}

function push(refspec: string, releaseTag?: string) {
	const environment = { ...cleanEnvironment };
	if (releaseTag !== undefined) environment.RELEASE_TAG = releaseTag;
	const result = spawnSync('git', ['push', 'origin', refspec], {
		cwd: repository,
		env: environment,
		encoding: 'utf8'
	});
	return { status: result.status, output: result.stderr };
}

const remoteHas = (ref: string) => {
	const result = spawnSync('git', ['rev-parse', '--verify', '-q', ref], {
		cwd: remote,
		env: cleanEnvironment
	});
	return result.status === 0;
};

function commit(message: string) {
	writeFileSync(join(repository, 'file.txt'), message);
	git(repository, 'add', 'file.txt');
	git(repository, 'commit', '-m', message);
	return git(repository, 'rev-parse', 'HEAD');
}

beforeEach(() => {
	mkdirSync(workRoot, { recursive: true });
	sandbox = mkdtempSync(join(workRoot, 'case-'));
	remote = join(sandbox, 'remote.git');
	repository = join(sandbox, 'repository');
	mkdirSync(repository);
	git(sandbox, 'init', '--bare', '-q', remote);
	git(repository, 'init', '-q', '-b', 'work');
	git(repository, 'config', 'user.name', 'Test');
	git(repository, 'config', 'user.email', 'test@example.com');
	git(repository, 'config', 'commit.gpgsign', 'false');
	git(repository, 'config', 'tag.gpgsign', 'false');
	git(repository, 'config', 'core.hooksPath', hooksDirectory);
	// Without this the bare repository itself refuses to delete its current branch: only the hook may.
	git(remote, 'config', 'receive.denyDeleteCurrent', 'ignore');
	git(repository, 'remote', 'add', 'origin', remote);
});

afterEach(() => {
	rmSync(sandbox, { recursive: true, force: true });
});

describe('pre-push hook', () => {
	it('lets a branch other than main through without a tag (happy path)', () => {
		commit('first');

		const result = push('work');

		expect(result.status).toBe(0);
		expect(remoteHas('refs/heads/work')).toBe(true);
	});

	it('refuses main without RELEASE_TAG (sad path)', () => {
		commit('first');

		const result = push('HEAD:main');

		expect(result.status).not.toBe(0);
		expect(result.output).toContain('RELEASE_TAG');
		expect(remoteHas('refs/heads/main')).toBe(false);
	});

	it('refuses main with an empty RELEASE_TAG (boundary)', () => {
		commit('first');

		const result = push('HEAD:main', '');

		expect(result.status).not.toBe(0);
		expect(remoteHas('refs/heads/main')).toBe(false);
	});

	it('refuses main when the tag does not exist (sad path)', () => {
		commit('first');

		const result = push('HEAD:main', 'v9.9.9');

		expect(result.status).not.toBe(0);
		expect(result.output).toContain('does not exist');
		expect(remoteHas('refs/heads/main')).toBe(false);
	});

	it('refuses main when the tag points to another commit (sad path)', () => {
		commit('first');
		git(repository, 'tag', 'v1.1.0');
		commit('second');

		const result = push('HEAD:main', 'v1.1.0');

		expect(result.status).not.toBe(0);
		expect(result.output).toContain('not to the pushed commit');
		expect(remoteHas('refs/heads/main')).toBe(false);
	});

	it('refuses to push to main a commit other than the tagged one even when HEAD is tagged', () => {
		const first = commit('first');
		commit('second');
		git(repository, 'tag', 'v1.1.0');

		const result = push(`${first}:refs/heads/main`, 'v1.1.0');

		expect(result.status).not.toBe(0);
		expect(result.output).toContain('not to the pushed commit');
		expect(remoteHas('refs/heads/main')).toBe(false);
	});

	it('accepts main on a lightweight tag of the pushed commit (happy path)', () => {
		const sha = commit('first');
		git(repository, 'tag', 'v1.1.0');

		const result = push('HEAD:main', 'v1.1.0');

		expect(result.status).toBe(0);
		expect(git(remote, 'rev-parse', 'refs/heads/main')).toBe(sha);
	});

	it('accepts main on an annotated tag of the pushed commit (happy path)', () => {
		const sha = commit('first');
		git(repository, 'tag', '-a', 'v1.1.0', '-m', 'release');

		const result = push('HEAD:main', 'v1.1.0');

		expect(result.status).toBe(0);
		expect(git(remote, 'rev-parse', 'refs/heads/main')).toBe(sha);
	});

	it('refuses to delete main even with a valid tag (sad path)', () => {
		commit('first');
		git(repository, 'tag', 'v1.1.0');
		expect(push('HEAD:main', 'v1.1.0').status).toBe(0);

		const result = push(':main', 'v1.1.0');

		expect(result.status).not.toBe(0);
		expect(result.output).toContain('deleting main');
		expect(remoteHas('refs/heads/main')).toBe(true);
	});

	it('lets a tag be pushed without RELEASE_TAG (boundary)', () => {
		commit('first');
		git(repository, 'tag', 'v1.1.0');

		const result = push('refs/tags/v1.1.0');

		expect(result.status).toBe(0);
		expect(remoteHas('refs/tags/v1.1.0')).toBe(true);
	});
});
