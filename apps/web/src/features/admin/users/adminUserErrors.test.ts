import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../../lib/apiClient';
import { parseAdminUserError } from './adminUserErrors';

describe('adminUserErrors (INV-14)', () => {
  describe('create context', () => {
    it('classifies 401 UNAUTHENTICATED as expireSession', () => {
      const error = new ApiRequestError(401, {
        code: 'UNAUTHENTICATED',
        message: 'Sensitive internal message that should never be displayed',
      });
      const action = parseAdminUserError(error, 'create');
      expect(action).toEqual({ type: 'expireSession' });
    });

    it('classifies 403 PASSWORD_RESET_REQUIRED as expireSession', () => {
      const error = new ApiRequestError(403, {
        code: 'PASSWORD_RESET_REQUIRED',
        message: 'Must reset password',
      });
      const action = parseAdminUserError(error, 'create');
      expect(action).toEqual({ type: 'expireSession' });
    });

    it('classifies 403 FORBIDDEN as forbidden with create catalog message and refreshSession', () => {
      const error = new ApiRequestError(403, {
        code: 'FORBIDDEN',
        message: 'Sensitive server permission denied message',
      });
      const action = parseAdminUserError(error, 'create');
      expect(action).toEqual({
        type: 'forbidden',
        message: 'You no longer have permission to create users.',
        refreshSession: true,
      });
    });

    it('classifies 429 TOO_MANY_ATTEMPTS with rounded minutes', () => {
      const error = new ApiRequestError(429, {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Rate limit hit',
        retryAfterSeconds: 120,
      });
      const action = parseAdminUserError(error, 'create');
      expect(action).toEqual({
        type: 'rateLimit',
        message: 'Too many users created. Try again in 2 minutes.',
        retryAfterSeconds: 120,
      });
    });

    it('classifies 429 TOO_MANY_ATTEMPTS with 1 minute singular', () => {
      const error = new ApiRequestError(429, {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Rate limit hit',
        retryAfterSeconds: 45,
      });
      const action = parseAdminUserError(error, 'create');
      expect(action).toEqual({
        type: 'rateLimit',
        message: 'Too many users created. Try again in 1 minute.',
        retryAfterSeconds: 45,
      });
    });

    it('classifies 400 VALIDATION_ERROR with field errors', () => {
      const error = new ApiRequestError(400, {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed message',
        fields: {
          email: 'Enter a valid email',
          firstName: 'Enter a first name',
        },
      });
      const action = parseAdminUserError(error, 'create');
      expect(action).toEqual({
        type: 'validation',
        fields: {
          email: 'Enter a valid email',
          firstName: 'Enter a first name',
        },
        message: 'Error',
      });
    });

    it('classifies 409 EMAIL_ALREADY_EXISTS with email field', () => {
      const error = new ApiRequestError(409, {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Collision on email',
        fields: {
          email: 'A user with this email already exists',
        },
      });
      const action = parseAdminUserError(error, 'create');
      expect(action).toEqual({
        type: 'emailAlreadyExists',
        field: 'email',
        message: 'A user with this email already exists',
      });
    });

    it('classifies unknown API errors as general with create fallback message without leaking error.message', () => {
      const error = new ApiRequestError(500, {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Postgres connection pool exhausted at db.ts:123',
      });
      const action = parseAdminUserError(error, 'create');
      expect(action).toEqual({
        type: 'general',
        message: "Couldn't create the user. Please try again.",
      });
    });

    it('classifies generic network/TypeError errors as general with fallback message', () => {
      const error = new TypeError('Failed to fetch');
      const action = parseAdminUserError(error, 'create');
      expect(action).toEqual({
        type: 'general',
        message: "Couldn't create the user. Please try again.",
      });
    });
  });

  describe('list context', () => {
    it('classifies 403 FORBIDDEN as forbidden with manage message', () => {
      const error = new ApiRequestError(403, { code: 'FORBIDDEN', message: 'Forbidden' });
      const action = parseAdminUserError(error, 'list');
      expect(action).toEqual({
        type: 'forbidden',
        message: 'You no longer have permission to manage users.',
        refreshSession: true,
      });
    });

    it('classifies 429 TOO_MANY_ATTEMPTS as rateLimit with tooManyRequests message', () => {
      const error = new ApiRequestError(429, {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Rate limit',
        retryAfterSeconds: 30,
      });
      const action = parseAdminUserError(error, 'list');
      expect(action).toEqual({
        type: 'rateLimit',
        message: 'Too many requests. Please wait a moment and try again.',
        retryAfterSeconds: 30,
      });
    });

    it('classifies 500 error as general with loadFailed message', () => {
      const error = new ApiRequestError(500, { code: 'SERVER_ERROR', message: 'Server error' });
      const action = parseAdminUserError(error, 'list');
      expect(action).toEqual({
        type: 'general',
        message: "Couldn't load users.",
      });
    });
  });

  describe('detail context', () => {
    it('classifies 404 USER_NOT_FOUND as userNotFound', () => {
      const error = new ApiRequestError(404, { code: 'USER_NOT_FOUND', message: 'Not found' });
      const action = parseAdminUserError(error, 'detail');
      expect(action).toEqual({
        type: 'userNotFound',
        message: 'This user no longer exists.',
      });
    });

    it('classifies 429 TOO_MANY_ATTEMPTS as rateLimit with tooManyRequests message', () => {
      const error = new ApiRequestError(429, {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Rate limit',
        retryAfterSeconds: 45,
      });
      const action = parseAdminUserError(error, 'detail');
      expect(action).toEqual({
        type: 'rateLimit',
        message: 'Too many requests. Please wait a moment and try again.',
        retryAfterSeconds: 45,
      });
    });

    it('classifies 500 as loadUserFailed', () => {
      const error = new ApiRequestError(500, { code: 'ERROR', message: 'Server error' });
      const action = parseAdminUserError(error, 'detail');
      expect(action).toEqual({
        type: 'general',
        message: "Couldn't load this user.",
      });
    });
  });

  describe('update context', () => {
    it('classifies 409 USER_CHANGED_SINCE_LOADED as conflictReload', () => {
      const error = new ApiRequestError(409, { code: 'USER_CHANGED_SINCE_LOADED', message: 'Conflict' });
      const action = parseAdminUserError(error, 'update');
      expect(action).toEqual({ type: 'conflictReload' });
    });

    it('classifies 409 EMAIL_ALREADY_EXISTS as emailAlreadyExists', () => {
      const error = new ApiRequestError(409, {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Conflict',
        fields: { email: 'Email taken' },
      });
      const action = parseAdminUserError(error, 'update');
      expect(action).toEqual({
        type: 'emailAlreadyExists',
        field: 'email',
        message: 'Email taken',
      });
    });

    it('classifies 429 as tooManyUserChanges', () => {
      const error = new ApiRequestError(429, { code: 'TOO_MANY_ATTEMPTS', message: 'Rate limit' });
      const action = parseAdminUserError(error, 'update');
      expect(action).toEqual({
        type: 'rateLimit',
        message: 'Too many user changes. Please wait a moment and try again.',
        retryAfterSeconds: 60,
      });
    });

    it('classifies 500 as updateFailed', () => {
      const error = new ApiRequestError(500, { code: 'ERROR', message: 'Server error' });
      const action = parseAdminUserError(error, 'update');
      expect(action).toEqual({
        type: 'general',
        message: "Couldn't save changes. Please try again.",
      });
    });
  });

  describe('password context', () => {
    it('classifies 403 CANNOT_CHANGE_OWN_PASSWORD as cannotChangeOwnPassword', () => {
      const error = new ApiRequestError(403, { code: 'CANNOT_CHANGE_OWN_PASSWORD', message: 'Cannot change own password' });
      const action = parseAdminUserError(error, 'password');
      expect(action).toEqual({
        type: 'cannotChangeOwnPassword',
        message: 'You no longer have permission to manage users.',
      });
    });

    it('classifies 429 as tooManyUserChanges', () => {
      const error = new ApiRequestError(429, { code: 'TOO_MANY_ATTEMPTS', message: 'Rate limit' });
      const action = parseAdminUserError(error, 'password');
      expect(action).toEqual({
        type: 'rateLimit',
        message: 'Too many user changes. Please wait a moment and try again.',
        retryAfterSeconds: 60,
      });
    });

    it('classifies 500 as passwordFailed', () => {
      const error = new ApiRequestError(500, { code: 'ERROR', message: 'Server error' });
      const action = parseAdminUserError(error, 'password');
      expect(action).toEqual({
        type: 'general',
        message: "Couldn't change the password. Please try again.",
      });
    });
  });
});
