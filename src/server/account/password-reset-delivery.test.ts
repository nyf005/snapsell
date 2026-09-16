import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('~/server/workers/queues', () => ({boss:{send:vi.fn(),work:vi.fn()},ensureBossReady:vi.fn(),QUEUE:{PASSWORD_RESET_EMAIL:'password-reset-email'}}));
vi.mock('./password-reset',()=>({findUserForPasswordReset:vi.fn(),issuePasswordResetToken:vi.fn(async()=>({token:'secret'}))}));
vi.mock('./password-reset-email',()=>({sendPasswordResetEmail:vi.fn()}));
import { deliverPasswordReset, enqueuePasswordReset, startPasswordResetEmailWorker } from './password-reset-delivery';
import { findUserForPasswordReset } from './password-reset';
import { sendPasswordResetEmail } from './password-reset-email';
import { boss } from '~/server/workers/queues';
beforeEach(()=>{vi.clearAllMocks();vi.mocked(findUserForPasswordReset).mockResolvedValue({id:'u',email:'user@example.com',passwordHash:'hash'} as never);});
const request=()=>({id:'request-1',email:'user@example.com',requestedAt:new Date().toISOString()});
it('queues unknown addresses without looking them up',async()=>{
 vi.mocked(boss.send).mockResolvedValue('job');
 await enqueuePasswordReset('unknown@example.com');
 expect(findUserForPasswordReset).not.toHaveBeenCalled();
 expect(boss.send).toHaveBeenCalledWith('password-reset-email',expect.objectContaining({email:'unknown@example.com'}));
});
it('signals delivery failure for durable retry, then allows recovery',async()=>{
 vi.mocked(sendPasswordResetEmail).mockResolvedValueOnce({ok:false,reason:'provider_error'}).mockResolvedValueOnce({ok:true,id:'mail'});
 await expect(deliverPasswordReset(request())).rejects.toThrow('delivery failed');
 await expect(deliverPasswordReset(request())).resolves.toBeUndefined();
});
it('does not send for an unknown account or stale job',async()=>{
 vi.mocked(findUserForPasswordReset).mockResolvedValue(null);
 await deliverPasswordReset(request());
 await deliverPasswordReset({...request(),requestedAt:new Date(0).toISOString()});
 expect(sendPasswordResetEmail).not.toHaveBeenCalled();
});
it('registers a worker for the reset queue',async()=>{
 await startPasswordResetEmailWorker();
 expect(boss.work).toHaveBeenCalledWith('password-reset-email',{localConcurrency:1},expect.any(Function));
});
