import { readFileSync } from 'node:fs';

// The color tokens of src/routes/layout.css, read from the `@theme` block: name and raw value (comments
// and line breaks removed). `light` and `dark` are the two arguments of `light-dark()`, when there is one.
export interface ColorToken {
	name: string;
	value: string;
	light: string;
	dark: string | null;
}

// The two arguments of a leading `light-dark(a, b)`, split on the comma that is not inside a call.
function arguments_(value: string): [string, string] | null {
	if (!value.startsWith('light-dark(') || !value.endsWith(')')) return null;
	const inner = value.slice('light-dark('.length, -1);
	let depth = 0;
	for (let index = 0; index < inner.length; index++) {
		const char = inner[index];
		if (char === '(') depth++;
		else if (char === ')') depth--;
		else if (char === ',' && depth === 0) {
			return [inner.slice(0, index).trim(), inner.slice(index + 1).trim()];
		}
	}
	return null;
}

export function readColorTokens(path = 'src/routes/layout.css'): ColorToken[] {
	const css = readFileSync(path, 'utf8');
	const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)![1]!;
	return [...theme.matchAll(/(--color-[a-z-]+):\s*([\s\S]*?);/g)].map((match) => {
		const value = match[2]!
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\s+/g, ' ')
			.replace(/\( /g, '(')
			.replace(/ \)/g, ')')
			.trim();
		const pair = arguments_(value);
		return { name: match[1]!, value, light: pair ? pair[0] : value, dark: pair ? pair[1] : null };
	});
}
