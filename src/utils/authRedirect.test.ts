/**
 * Regression tests for the post-2FA / post-login redirect decision.
 * Run with: npm run test:redirect
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPostAuthRedirect, isOnboardingComplete, normalizeAccountType } from './authRedirect.ts';

test('signup (first-time) — every role reaches its own portal, never the Company Portal', () => {
    assert.equal(getPostAuthRedirect('student'), '/student');
    assert.equal(getPostAuthRedirect('adviser'), '/adviser');
    assert.equal(getPostAuthRedirect('coordinator'), '/coordinator');
    assert.equal(getPostAuthRedirect('company'), '/company');
    assert.equal(getPostAuthRedirect('admin'), '/admin');
});

test('login (returning) — same mapping, so no role is re-routed elsewhere', () => {
    for (const role of ['student', 'adviser', 'coordinator', 'company', 'admin'] as const) {
        assert.equal(getPostAuthRedirect(role), `/${role}`);
    }
});

test('role strings are matched case- and whitespace-insensitively', () => {
    assert.equal(getPostAuthRedirect('Student'), '/student');
    assert.equal(getPostAuthRedirect(' ADVISER '), '/adviser');
    assert.equal(normalizeAccountType('Coordinator'), 'coordinator');
});

test('unknown or missing roles fall back to login, not to a portal', () => {
    assert.equal(getPostAuthRedirect(undefined), '/login');
    assert.equal(getPostAuthRedirect(null), '/login');
    assert.equal(getPostAuthRedirect(''), '/login');
    assert.equal(getPostAuthRedirect('teacher'), '/login');
    assert.equal(normalizeAccountType('teacher'), null);
});

test('onboarding completion is derived per role', () => {
    assert.equal(isOnboardingComplete({ account_type: 'student', company_id: 'c1' }), false);
    assert.equal(
        isOnboardingComplete({
            account_type: 'student',
            company_id: 'c1',
            course: 'BSIT',
            department: 'CCS',
            year_level: '4',
        }),
        true
    );

    assert.equal(isOnboardingComplete({ account_type: 'adviser' }), false);
    assert.equal(
        isOnboardingComplete({
            account_type: 'adviser',
            adviser_type: 'IT Adviser',
            contact_number: '09171234567',
            birthday: '2000-01-01',
            region_code: '07',
        }),
        true
    );

    assert.equal(isOnboardingComplete({ account_type: 'company' }), false);
    assert.equal(isOnboardingComplete({ account_type: 'company', company_id: 'c1' }), true);

    // Coordinators onboard too: personal + address + department.
    assert.equal(isOnboardingComplete({ account_type: 'coordinator' }), false);
    assert.equal(
        isOnboardingComplete({
            account_type: 'coordinator',
            department: 'Information Technology',
            contact_number: '09171234567',
            birthday: '1990-01-01',
            region_code: '07',
        }),
        true
    );

    // Admin has no onboarding step.
    assert.equal(isOnboardingComplete({ account_type: 'admin' }), true);

    assert.equal(isOnboardingComplete(null), false);
    assert.equal(isOnboardingComplete({ account_type: 'nope' }), false);
});
