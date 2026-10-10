import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// The full default rule set of axe (WCAG 2.x A/AA and best practices) finds nothing on the page.
// Each violation is reported with its rule, its element and axe's message.
export async function expectNoAxeViolations(page: Page): Promise<void> {
	const { violations } = await new AxeBuilder({ page }).analyze();
	const summary = violations.flatMap((violation) =>
		violation.nodes.map(
			(node) => `${violation.id}: ${node.target.join(' ')} (${node.any[0]?.message ?? ''})`
		)
	);
	expect(summary).toEqual([]);
}
