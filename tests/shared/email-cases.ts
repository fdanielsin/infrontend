// Addresses and the verdict of the server for each, from `CreateUserRequest.email` in the API
// contract. One table for the unit test of `isValidEmail` and for the check on a real server.
type EmailCase = readonly [email: string, accepted: boolean, why: string];

const a = (count: number) => 'a'.repeat(count);
const FAR = '\u{20000}'; // a letter outside the BMP: one character, two UTF-16 units

export const EMAIL_CASES: readonly EmailCase[] = [
	// The examples of the contract.
	['ada@exemple.fr', true, 'a plain address'],
	['ivan@пример.рф', true, 'an international domain'],
	['a@b.co', true, 'the shortest TLD'],
	['a@b.xn--p1ai', true, 'a punycode TLD'],
	['q.x@b.co', true, 'a dot inside the local part'],
	['a@b.c', false, 'a TLD of 1 character'],
	['a@b_c.com', false, 'an underscore in a label'],
	['a@-b.com', false, 'a hyphen at the start of a label'],
	['a@b-.com', false, 'a hyphen at the end of a label'],
	['a@b.c0m', false, 'a digit in the TLD'],
	['.q@b.co', false, 'a dot at the start of the local part'],
	['q.@b.co', false, 'a dot at the end of the local part'],
	['q..x@b.co', false, 'two dots in the local part'],
	['', false, 'an empty address'],
	// Boundaries.
	[`${a(64)}@b.co`, true, 'a local part of 64'],
	[`${a(65)}@b.co`, false, 'a local part of 65'],
	[`a@${a(63)}.co`, true, 'a label of 63'],
	[`a@${a(64)}.co`, false, 'a label of 64'],
	[`a@b.${a(24)}`, true, 'a TLD of 24'],
	[`a@b.${a(25)}`, false, 'a TLD of 25'],
	['a@b.xn--', false, 'the punycode prefix alone'],
	['a@b.xn-a', false, 'a single hyphen after xn'],
	['a@b.xn--a-', false, 'a hyphen at the end of a punycode TLD'],
	['a@b.xn--a_', false, 'an underscore in a punycode TLD'],
	['a@b.c-m', false, 'a hyphen inside a TLD of letters'],
	['a@b.\u0301ab', false, 'a TLD that starts with a combining mark'],
	['a@1b.co', true, 'a label that starts with a digit'],
	['a@b\u00b2.co', false, 'a superscript digit in a label'],
	[`a@${FAR.repeat(63)}.co`, true, 'a label of 63 characters outside the BMP'],
	[`a@b.${FAR.repeat(24)}`, true, 'a TLD of 24 characters outside the BMP'],
	["a+b_c-d!#$%'1@b.co", true, 'a local part with punctuation'],
	['a@b.xn--a', true, 'the punycode prefix and one character'],
	[`a@b.xn--${a(20)}`, true, 'a punycode TLD of 24 characters'],
	[`a@b.xn--${a(21)}`, false, 'a punycode TLD of 25 characters'],
	['a@b..co', false, 'an empty label'],
	['a@co', false, 'a single label'],
	['a@@b.co', false, 'two @'],
	['ab.co', false, 'no @'],
	// Characters.
	['a\u00a0b@b.co', false, 'a no-break space'],
	['a\u0007b@b.co', false, 'a control character'],
	[`${FAR.repeat(64)}@b.co`, true, 'a local part of 64 characters outside the BMP'],
	['a@b.e\u0301', true, 'a combining mark counted in the TLD'],
	['josé.x@example.com', true, 'an accented local part'],
	['ivan@xn--e1afmkfd.xn--p1ai', true, 'the punycode form of an international domain'],
	[`${a(10_000)}@b.co`, false, 'a very long address']
];
