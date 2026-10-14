import type { LayoutServerLoad } from './$types';

// The theme the cookie asks for, so that the right radio is checked in the first HTML.
export const load: LayoutServerLoad = ({ locals }) => ({ theme: locals.theme });
