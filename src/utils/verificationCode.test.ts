/**
 * Verification-code window rules.
 * Run with: npm run test:verification
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    OTP_EXPIRED_MESSAGE,
    OTP_INVALID_MESSAGE,
    OTP_TTL_MS,
    classifyRejectedCode,
    rejectedCodeMessage,
} from './verificationCode.ts';

const ISSUED = 1_788_000_000_000; // an arbitrary server reading, in epoch ms
const minutes = (n: number) => n * 60 * 1000;

test('the window is exactly 10 minutes', () => {
    assert.equal(OTP_TTL_MS, minutes(10));
});

test('a code rejected inside the window is invalid, never "expired"', () => {
    // This is the reported bug: the code was used well inside 10 minutes and
    // was still reported as expired.
    assert.equal(classifyRejectedCode(ISSUED, ISSUED + minutes(1)), 'invalid');
    assert.equal(classifyRejectedCode(ISSUED, ISSUED + minutes(5)), 'invalid');
    assert.equal(classifyRejectedCode(ISSUED, ISSUED + minutes(9)), 'invalid');
    assert.equal(classifyRejectedCode(ISSUED, ISSUED + minutes(9.9)), 'invalid');
});

test('the boundary belongs to the user', () => {
    assert.equal(classifyRejectedCode(ISSUED, ISSUED), 'invalid');
    assert.equal(classifyRejectedCode(ISSUED, ISSUED + OTP_TTL_MS), 'invalid');
    assert.equal(classifyRejectedCode(ISSUED, ISSUED + OTP_TTL_MS + 1), 'expired');
});

test('a code rejected past the window is expired', () => {
    assert.equal(classifyRejectedCode(ISSUED, ISSUED + minutes(10.5)), 'expired');
    assert.equal(classifyRejectedCode(ISSUED, ISSUED + minutes(60)), 'expired');
});

test('a resend restarts the window', () => {
    const resentAt = ISSUED + minutes(9);
    // Judged against the NEW issue time, not the original one.
    assert.equal(classifyRejectedCode(resentAt, resentAt + minutes(3)), 'invalid');
    assert.equal(classifyRejectedCode(ISSUED, resentAt + minutes(3)), 'expired');
});

test('without a recorded issue time we never claim expiry', () => {
    assert.equal(classifyRejectedCode(null, ISSUED), 'invalid');
    assert.equal(classifyRejectedCode(undefined, ISSUED), 'invalid');
    assert.equal(classifyRejectedCode(ISSUED, null), 'invalid');
    assert.equal(classifyRejectedCode(Number.NaN, ISSUED), 'invalid');
    assert.equal(classifyRejectedCode(ISSUED, Number.POSITIVE_INFINITY), 'invalid');
});

test('messages match the classification', () => {
    assert.equal(rejectedCodeMessage(ISSUED, ISSUED + minutes(2)), OTP_INVALID_MESSAGE);
    assert.equal(rejectedCodeMessage(ISSUED, ISSUED + minutes(11)), OTP_EXPIRED_MESSAGE);
    assert.match(OTP_EXPIRED_MESSAGE, /expired/i);
    assert.match(OTP_INVALID_MESSAGE, /invalid/i);
});
