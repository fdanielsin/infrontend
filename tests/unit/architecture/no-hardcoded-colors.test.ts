import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every color is a token of src/routes/layout.css (docs/design-system.md, "Couleurs sémantiques"):
// no component names a hex, a color function, a CSS color keyword or a Tailwind palette shade.
const SRC = join(import.meta.dirname, '../../../src');
const SOURCE_FILE = /\.(svelte|ts|css|html)$/;
// layout.css owns the values; the API client is generated; an asset is not styled by tokens.
const EXEMPT = [/^routes\/layout\.css$/, /^lib\/api\//, /^lib\/paraglide\//, /^lib\/assets\//];

const PALETTE =
	'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const KEYWORDS =
	'white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|brown|navy|teal|silver';
const UTILITIES =
	'bg|text|border|border-[xytblrse]|outline|ring|fill|stroke|from|via|to|shadow|accent|caret|decoration|divide|placeholder';

const FORBIDDEN: { pattern: RegExp; use: string }[] = [
	{ pattern: /#[0-9a-fA-F]{3,8}\b/, use: 'no hex value: name a --color-* token in layout.css' },
	{
		pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/,
		use: 'no color function: name a --color-* token in layout.css'
	},
	{
		// text-white, hover:bg-blue-600, border-gray-300/50, bg-[#fff]
		pattern: new RegExp(
			`(?<![\\w-])(?:[\\w-]+:)*-?(?:${UTILITIES})-(?:white|black|(?:${PALETTE})-\\d{2,3})(?![\\w-])`
		),
		use: 'no palette class: use a semantic token (text-on-primary, text-on-toast, bg-primary...)'
	},
	{
		pattern: new RegExp(
			`(?:^|[\\s{;])(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|outline-color|fill|stroke)\\s*:\\s*(?:${KEYWORDS})\\b`
		),
		use: 'no color keyword: name a --color-* token in layout.css'
	}
];

const files = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]
	);

const violations = (zone: string, text: string): string[] =>
	text
		.split('\n')
		.flatMap((line, index) =>
			FORBIDDEN.filter(({ pattern }) => pattern.test(line)).map(
				({ use }) => `${zone}:${index + 1}: hard-coded color, ${use}`
			)
		);

describe('no hard-coded color outside layout.css', () => {
	it('finds no color in src/', () => {
		const found = files(SRC)
			.map((file) => ({ zone: relative(SRC, file), file }))
			.filter(({ zone }) => SOURCE_FILE.test(zone) && !EXEMPT.some((rule) => rule.test(zone)))
			.flatMap(({ zone, file }) => violations(zone, readFileSync(file, 'utf8')));
		expect(found).toEqual([]);
	});

	it.each([
		['a hex', 'class="bg-[#fff]" style="color: #1a2b3c"'],
		['a white class', 'class="text-white"'],
		['a variant white class', 'class="hover:bg-white/20"'],
		['a palette shade', "'border border-gray-300 text-blue-600'"],
		['an rgb function', 'color: rgb(0 0 0 / 50%);'],
		['a keyword', 'background: white;']
	])('refuses %s', (_name, line) => {
		expect(violations('src/lib/ui/Fake.svelte', line)).not.toEqual([]);
	});

	it.each([
		['a token class', 'class="bg-primary text-on-primary hover:bg-on-toast-hover"'],
		['a token variable', 'color: var(--color-heading);'],
		['transparent', 'class="border-transparent disabled:hover:bg-transparent"'],
		['a size', 'class="text-sm border-2 px-4"']
	])('accepts %s', (_name, line) => {
		expect(violations('src/lib/ui/Fake.svelte', line)).toEqual([]);
	});
});
