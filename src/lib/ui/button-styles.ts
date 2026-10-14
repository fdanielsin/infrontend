export type ButtonVariant = 'primary' | 'secondary' | 'link';
export type ButtonSize = 'md' | 'sm';
// Only the secondary variant follows the surface it sits on: `danger` on an error banner,
// `inverse` on a colored toast.
export type ButtonTone = 'default' | 'danger' | 'inverse';

interface Options {
	variant?: ButtonVariant;
	size?: ButtonSize;
	tone?: ButtonTone;
	block?: boolean;
}

// Whole class names, so Tailwind finds them.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
	primary:
		'border border-transparent bg-primary text-on-primary hover:bg-primary-hover disabled:bg-disabled',
	secondary: 'border',
	link: 'min-h-6 px-1 text-action-strong hover:text-action-strong-hover disabled:text-disabled'
};

const SECONDARY_TONE_CLASSES: Record<ButtonTone, string> = {
	default:
		'border-action-strong text-action-strong hover:bg-action-strong/10 disabled:border-disabled disabled:text-disabled disabled:hover:bg-transparent',
	danger:
		'border-danger text-danger hover:bg-danger/10 disabled:border-disabled disabled:text-disabled disabled:hover:bg-transparent',
	inverse:
		'border-on-toast text-on-toast hover:bg-on-toast-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse'
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
	md: 'px-4 py-2',
	sm: 'min-h-6 px-2 py-1 text-sm'
};

// The one place where the look of an action is decided: `Button` and `ButtonLink` both read it.
export function buttonClasses({
	variant = 'primary',
	size = 'md',
	tone = 'default',
	block = false
}: Options = {}): string {
	// Busy: the label and `aria-busy` say it; the pointer shows it. No opacity, which would lower the contrast.
	const classes = [VARIANT_CLASSES[variant], 'aria-busy:cursor-progress'];
	if (variant !== 'link') classes.push('rounded-control', SIZE_CLASSES[size]);
	if (variant === 'secondary') classes.push(SECONDARY_TONE_CLASSES[tone]);
	if (block) classes.push('w-full');
	return classes.join(' ');
}
