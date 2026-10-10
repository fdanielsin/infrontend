export type FieldStatus = 'neutral' | 'invalid' | 'valid';

interface Options<Field extends string> {
	fields: readonly Field[];
	// Fields that are fine empty: they never show a success when empty.
	optional?: readonly Field[];
	values: () => Record<Field, string>;
	// The errors (message keys) of the current values, from the schema of the form.
	check: () => Partial<Record<Field, string>>;
}

interface FieldState {
	// The value was changed since the form was last clean: a field only tabbed through stays neutral.
	touched: boolean;
	// The field has shown an error: from then on it is revalidated at each keystroke.
	armed: boolean;
	status: FieldStatus;
	error: string | undefined;
	// What the server refused: kept, with its message, for as long as the value stays the same.
	refused: { value: string; error: string } | undefined;
}

const clean = (): FieldState => ({
	touched: false,
	armed: false,
	status: 'neutral',
	error: undefined,
	refused: undefined
});

// The button under a mouse or touch press. The focus leaves the field at the press, and an error
// inserted then moves the button before the release: the click would be lost. A keyboard Tab has
// no such gap, so only a press counts (`relatedTarget` is empty for a button clicked in Safari).
let pressedButton: Element | null = null;
if (typeof document !== 'undefined') {
	document.addEventListener(
		'pointerdown',
		(event) => {
			pressedButton = event.target instanceof Element ? event.target.closest('button') : null;
		},
		true
	);
	const release = () => (pressedButton = null);
	document.addEventListener('pointerup', release, true);
	document.addEventListener('pointercancel', release, true);
}

function leavesForPressedFormButton(event: FocusEvent) {
	const field = event.currentTarget;
	return (
		pressedButton instanceof HTMLButtonElement &&
		pressedButton.form !== null &&
		field instanceof HTMLElement &&
		'form' in field &&
		pressedButton.form === field.form
	);
}

// Validation when the field is left, then live once it shows an error. The rules stay in the
// schemas: this only holds what each field shows.
export function createFieldValidation<Field extends string>({
	fields,
	optional = [],
	values,
	check
}: Options<Field>) {
	const state = $state(Object.fromEntries(fields.map((field) => [field, clean()]))) as Record<
		Field,
		FieldState
	>;

	function validate(field: Field) {
		const refused = state[field].refused;
		if (refused && values()[field] === refused.value) {
			state[field].error = refused.error;
			state[field].status = 'invalid';
			return;
		}
		state[field].refused = undefined;
		const error = check()[field];
		const empty = values()[field].trim() === '';
		state[field].error = error;
		if (error) state[field].armed = true;
		state[field].status = error
			? 'invalid'
			: optional.includes(field) && empty
				? 'neutral'
				: 'valid';
	}

	return {
		status: (field: Field) => state[field].status,
		error: (field: Field) => state[field].error,
		input(field: Field) {
			state[field].touched = true;
			if (state[field].armed) validate(field);
		},
		// `event` is the blur event of the field, when it comes from one.
		blur(field: Field, event?: FocusEvent) {
			if (event && leavesForPressedFormButton(event)) return;
			if (state[field].touched) validate(field);
		},
		// Every field with an error shows it, touched or not; the others keep what they show.
		submit() {
			const errors = check();
			for (const field of fields) {
				if (errors[field]) validate(field);
				else if (state[field].touched) validate(field);
			}
			return errors;
		},
		reject(field: Field, error: string) {
			state[field].touched = true;
			state[field].armed = true;
			state[field].error = error;
			state[field].status = 'invalid';
			state[field].refused = { value: values()[field], error };
		},
		reset() {
			for (const field of fields) state[field] = clean();
		}
	};
}
