import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextAuthConfig } from 'next-auth';
vi.mock('next-auth', () => ({ default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })) }));
vi.mock('~/server/db', () => ({ db: { user: { findUnique: vi.fn() } } }));
import NextAuth from 'next-auth';
import { db } from '~/server/db';
import './auth';
const config = vi.mocked(NextAuth).mock.calls[0]![0] as NextAuthConfig;
const jwt = config.callbacks!.jwt!;
const run = (token: Record<string, unknown>, user?: Record<string, unknown>) => jwt({ token, user } as never);
beforeEach(() => { vi.mocked(db.user.findUnique).mockResolvedValue({tokenVersion:4,tenantId:'t',role:'OWNER'} as never); });
describe('session revocation', () => {
 it('rejects an old session immediately even with a fresh timestamp', async () => {
  expect(await run({sub:'u',role:'OWNER',tokenVersion:3,tokenVersionCheckedAt:Date.now()})).toBeNull();
 });
 it('does not revive a token without role or version', async () => {
  expect(await run({sub:'u',email:'u@example.com',tokenVersion:3})).toBeNull();
  expect(await run({sub:'u',email:'u@example.com'})).toBeNull();
 });
 it('accepts a current session', async () => {
  expect(await run({sub:'u',tokenVersion:4})).toMatchObject({sub:'u',tokenVersion:4,role:'OWNER'});
 });
 it('rejects a login validated with the old password before a concurrent reset', async () => {
  expect(await run({}, {id:'u',role:'OWNER',tokenVersion:3})).toBeNull();
 });
});
