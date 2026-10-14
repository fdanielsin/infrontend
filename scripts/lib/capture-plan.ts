import path from 'node:path';
import { REFERENCE_PORTS, USER_PORTS, checkPort } from './guard.ts';
import {
	LOCALES,
	SCREENS,
	STATES,
	WIDTHS,
	type CaptureState,
	type Locale,
	type Screen,
	type Width
} from './capture-catalog.ts';

// The preview of the reference (5174) is the user's too: a capture never goes there.
const FORBIDDEN_PORTS: readonly number[] = [...USER_PORTS, ...REFERENCE_PORTS, 5174];

export interface CaptureFilters {
	screens?: Screen[];
	states?: string[];
	widths?: Width[];
	locales?: Locale[];
}

export interface CaptureEntry {
	screen: Screen;
	state: string;
	description: string;
	width: Width;
	locale: Locale;
	// Relative to the output folder: `<screen>/<state>/<width>-<locale>.png`.
	file: string;
}

export interface CaptureOptions {
	port: number;
	outDir: string;
	build: boolean;
	filters: CaptureFilters;
}

// Every option takes one value or a comma-separated list: --locale=fr,de.
const LIST_FLAGS = ['screen', 'state', 'width', 'locale'] as const;
const DEFAULT_OUT = 'test-results/captures';

function listOf(flag: string, value: string): string[] {
	const items = value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
	if (items.length === 0) throw new Error(`--${flag} needs a value.`);
	return items;
}

function oneOf<T extends string | number>(
	flag: string,
	items: string[],
	allowed: readonly T[]
): T[] {
	return items.map((item) => {
		const found = allowed.find((candidate) => String(candidate) === item);
		if (found === undefined) {
			throw new Error(`--${flag}: "${item}" is unknown (expected ${allowed.join(', ')}).`);
		}
		return found;
	});
}

/**
 * The settings of `bun run captures`: `CAPTURE_PORT` (required, one per worktree, never a user port),
 * `--out=<folder under test-results/>`, `--skip-build` and the filters `--screen`, `--state`,
 * `--width`, `--locale`.
 */
export function parseCaptureArgs(
	argv: string[],
	env: NodeJS.ProcessEnv,
	root: string
): CaptureOptions {
	const port = checkPort('CAPTURE_PORT', env.CAPTURE_PORT, FORBIDDEN_PORTS);
	const raw = new Map<string, string>();
	let build = true;
	let out = DEFAULT_OUT;
	for (const arg of argv) {
		if (arg === '--skip-build') {
			build = false;
			continue;
		}
		const match = /^--([a-z]+)=(.*)$/.exec(arg);
		const flag = match?.[1];
		if (!match || !flag || (flag !== 'out' && !(LIST_FLAGS as readonly string[]).includes(flag))) {
			throw new Error(`Unknown argument: ${arg}`);
		}
		if (flag === 'out') out = match[2] ?? '';
		else raw.set(flag, match[2] ?? '');
	}
	// The folder is emptied at the start of a run: only a folder of test-results/ may be.
	const outDir = path.resolve(root, out);
	const results = path.resolve(root, 'test-results');
	if (!out || !outDir.startsWith(results + path.sep)) {
		throw new Error(`--out must be a folder inside test-results/, got "${out}".`);
	}
	const filters: CaptureFilters = {};
	const get = (flag: string) => {
		const value = raw.get(flag);
		return value === undefined ? undefined : listOf(flag, value);
	};
	const screens = get('screen');
	if (screens) filters.screens = oneOf('screen', screens, SCREENS);
	const states = get('state');
	if (states) filters.states = states;
	const widths = get('width');
	if (widths) filters.widths = oneOf('width', widths, WIDTHS);
	const locales = get('locale');
	if (locales) filters.locales = oneOf('locale', locales, LOCALES);
	// Planning checks the names of states, so that a typo fails before any browser starts.
	planCaptures(filters);
	return { port, outDir, build, filters };
}

/** Every capture to take, in a stable order: screen, state, width, language. */
export function planCaptures(
	filters: CaptureFilters = {},
	states: readonly CaptureState[] = STATES
): CaptureEntry[] {
	const known = new Set(states.map((state) => state.name));
	for (const name of filters.states ?? []) {
		if (!known.has(name)) {
			throw new Error(`--state: "${name}" is unknown (expected ${[...known].join(', ')}).`);
		}
	}
	const entries: CaptureEntry[] = [];
	for (const state of states) {
		if (filters.screens && !filters.screens.includes(state.screen)) continue;
		if (filters.states && !filters.states.includes(state.name)) continue;
		for (const width of filters.widths ?? WIDTHS) {
			for (const locale of filters.locales ?? LOCALES) {
				entries.push({
					screen: state.screen,
					state: state.name,
					description: state.description,
					width,
					locale,
					file: `${state.screen}/${state.name}/${width}-${locale}.png`
				});
			}
		}
	}
	if (entries.length === 0) throw new Error('The filters select no capture.');
	return entries;
}

export interface CaptureResult {
	entry: CaptureEntry;
	bytes: number;
}

/** The index of a run, as a Markdown table the designer reads beside the images. */
export function renderIndex(results: CaptureResult[], forbiddenRequests: number): string {
	const lines = [
		'# Captures',
		'',
		`${results.length} captures, ${forbiddenRequests} request(s) to a forbidden port.`,
		'',
		'| Screen | State | Width | Language | File | Bytes | What it shows |',
		'| --- | --- | --- | --- | --- | --- | --- |'
	];
	for (const { entry, bytes } of results) {
		lines.push(
			`| ${entry.screen} | ${entry.state} | ${entry.width} | ${entry.locale} | [${entry.file}](${entry.file}) | ${bytes} | ${entry.description} |`
		);
	}
	return `${lines.join('\n')}\n`;
}
