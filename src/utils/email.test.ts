/**
 * Email normalization and duplicate-registration detection.
 * Run with: npm run test:email
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    EMAIL_ALREADY_REGISTERED_MESSAGE,
    isDuplicateEmailError,
    normalizeEmail,
    toRegistrationErrorMessage,
} from './email.ts';

test('normalizeEmail collapses case and surrounding whitespace', () => {
    const canonical = 'user@example.com';
    assert.equal(normalizeEmail('User@Example.com'), canonical);
    assert.equal(normalizeEmail('user@example.com'), canonical);
    assert.equal(normalizeEmail('  user@example.com  '), canonical);
    assert.equal(normalizeEmail('\tUSER@EXAMPLE.COM\n'), canonical);
});

test('normalizeEmail is total — no throw on missing input', () => {
    assert.equal(normalizeEmail(null), '');
    assert.equal(normalizeEmail(undefined), '');
    assert.equal(normalizeEmail('   '), '');
});

test('normalizeEmail is idempotent', () => {
    const once = normalizeEmail('  Student@AsianCollege.EDU.PH ');
    assert.equal(normalizeEmail(once), once);
});

test('isDuplicateEmailError recognises every shape the failure arrives in', () => {
    // Our own server-side guards
    assert.ok(isDuplicateEmailError({ message: 'EMAIL_ALREADY_REGISTERED' }));
    assert.ok(isDuplicateEmailError({ message: 'ACCOUNT_TYPE_CHANGE_NOT_ALLOWED' }));
    // Raw Postgres unique violation from the database backstop
    assert.ok(isDuplicateEmailError({ code: '23505', message: 'duplicate key value' }));
    assert.ok(isDuplicateEmailError({ message: 'duplicate key value violates unique constraint "profiles_email_lower_unique_idx"' }));
    // Supabase Auth's own responses
    assert.ok(isDuplicateEmailError({ code: 'user_already_exists' }));
    assert.ok(isDuplicateEmailError({ code: 'email_exists' }));
    assert.ok(isDuplicateEmailError({ message: 'User already registered' }));
});

test('isDuplicateEmailError leaves unrelated failures alone', () => {
    assert.equal(isDuplicateEmailError(null), false);
    assert.equal(isDuplicateEmailError(undefined), false);
    assert.equal(isDuplicateEmailError({}), false);
    assert.equal(isDuplicateEmailError({ message: 'Invalid login credentials' }), false);
    assert.equal(isDuplicateEmailError({ code: '23503', message: 'foreign key violation' }), false);
    assert.equal(isDuplicateEmailError({ message: 'Token has expired' }), false);
});

test('toRegistrationErrorMessage hides database detail behind one message', () => {
    assert.equal(
        toRegistrationErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint' }, 'fallback'),
        EMAIL_ALREADY_REGISTERED_MESSAGE,
    );
    assert.equal(toRegistrationErrorMessage({ message: 'Network error' }, 'fallback'), 'Network error');
    assert.equal(toRegistrationErrorMessage({}, 'fallback'), 'fallback');
    assert.equal(toRegistrationErrorMessage(null, 'fallback'), 'fallback');
});
