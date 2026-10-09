// The e-mail rule of the API contract (`CreateUserRequest.email`), applied as the server applies it:
// an address is valid on both sides or on neither. Lengths count Unicode code points, like the
// server's. The value is what the form sends, without the spaces at its ends; the server also
// lowercases it, which changes neither a length nor a class of characters.
// Two known gaps, out of reach of a keyboard or of a recent character: `trim()` keeps U+0085 and
// drops U+FEFF where the server does the opposite, and `\p{L}`, `\p{M}` and `\p{Nd}` follow the
// Unicode version of the browser, while the server's tables stop before Unicode 15.1.
const LOCAL_MAX = 64;
const LABEL_MAX = 63;
const TLD_MIN = 2;
const TLD_MAX = 24;
const PUNYCODE_PREFIX = 'xn--';

const SPACE_OR_CONTROL = /[\p{White_Space}\p{Cc}]/u;
const LABEL_CHARACTERS = /^[\p{L}\p{M}\p{Nd}-]+$/u;
const TLD_LETTERS = /^\p{L}[\p{L}\p{M}]*$/u;

const size = (text: string) => [...text].length;

function isLocalPart(local: string): boolean {
	return (
		local !== '' &&
		size(local) <= LOCAL_MAX &&
		!local.startsWith('.') &&
		!local.endsWith('.') &&
		!local.includes('..')
	);
}

function isLabel(label: string): boolean {
	return (
		size(label) <= LABEL_MAX &&
		LABEL_CHARACTERS.test(label) &&
		!label.startsWith('-') &&
		!label.endsWith('-')
	);
}

// The last label, already checked by `isLabel`, is either letters (and the marks some alphabets
// need) or the `xn--` form of an internationalized TLD; digits and hyphens are only allowed in the
// second. `xn--` alone never gets here: it ends with a hyphen, which `isLabel` refuses.
function isTopLevelLabel(label: string): boolean {
	const length = size(label);
	if (label.slice(0, PUNYCODE_PREFIX.length).toLowerCase() === PUNYCODE_PREFIX) {
		return length <= TLD_MAX;
	}
	return length >= TLD_MIN && length <= TLD_MAX && TLD_LETTERS.test(label);
}

// A second `@` ends up in a label of the domain, which `isLabel` refuses.
export function isValidEmail(value: string): boolean {
	if (SPACE_OR_CONTROL.test(value)) return false;
	const at = value.indexOf('@');
	if (at === -1) return false;
	const labels = value.slice(at + 1).split('.');
	return (
		isLocalPart(value.slice(0, at)) &&
		labels.length >= 2 &&
		labels.every(isLabel) &&
		isTopLevelLabel(labels.at(-1) ?? '')
	);
}
