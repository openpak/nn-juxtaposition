import { describe, expect, it } from 'vitest';
import { isWelcomeExempt } from '@/sso';

describe('welcome page redirect', () => {
	it('does not bounce the sign-in steps (their code is single use)', () => {
		expect(isWelcomeExempt('/login')).toBe(true);
		expect(isWelcomeExempt('/login/callback')).toBe(true);
		expect(isWelcomeExempt('/welcome')).toBe(true);
		expect(isWelcomeExempt('/welcome/accept')).toBe(true);
		expect(isWelcomeExempt('/logout')).toBe(true);
	});

	it('sends everything else to the welcome page until the rules are accepted', () => {
		for (const path of ['/', '/titles', '/feed', '/posts/abc', '/users/me']) {
			expect(isWelcomeExempt(path)).toBe(false);
		}
	});
});
