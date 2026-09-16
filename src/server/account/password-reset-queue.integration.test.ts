import { describe, it, expect, vi } from 'vitest';
vi.mock('~/env', async importOriginal => {
 const original = await importOriginal<typeof import('~/env')>();
 return {env:{...original.env, PG_BOSS_ROLE:'worker'}};
});
vi.mock('./password-reset-email',()=>({sendPasswordResetEmail:vi.fn(async()=>({ok:true,id:'fake-email'}))}));
vi.setConfig({testTimeout:30000,hookTimeout:30000});
describe.skipIf(process.env.RUN_INTEGRATION_TESTS!=='true')('password reset real queue',()=>{
 it('persists a request and delivers it through the registered worker without storing its secret in the queue',async()=>{
  const {db}=await import('~/server/db');
  const {boss,ensureBossReady,ensureQueues,QUEUE}=await import('~/server/workers/queues');
  const {enqueuePasswordReset,startPasswordResetEmailWorker}=await import('./password-reset-delivery');
  const {sendPasswordResetEmail}=await import('./password-reset-email');
  const tenant=await db.tenant.create({data:{name:'Queue audit'}});
  const email=`queue-${Date.now()}@example.test`;
  const user=await db.user.create({data:{tenantId:tenant.id,email,passwordHash:'old'}});
  try {
   await ensureBossReady(); await ensureQueues(); await startPasswordResetEmailWorker();
   await enqueuePasswordReset(email);
   await vi.waitFor(()=>expect(sendPasswordResetEmail).toHaveBeenCalledWith(email,expect.stringMatching(/^[a-f0-9]{64}$/)),{timeout:10000});
   expect(await db.passwordResetToken.count({where:{userId:user.id,usedAt:null}})).toBe(1);
   const jobs=await db.$queryRaw<Array<{id:string;data:Record<string,unknown>}>>`SELECT id, data FROM pgboss.job WHERE name = ${QUEUE.PASSWORD_RESET_EMAIL} AND data->>'email' = ${email}`;
   expect(jobs).toHaveLength(1);
   expect(jobs[0]!.data).toEqual({id:expect.any(String),email,requestedAt:expect.any(String)});
   await boss.stop({graceful:true});
   for(const job of jobs) await db.$executeRaw`DELETE FROM pgboss.job WHERE id = ${job.id}::uuid AND name = ${QUEUE.PASSWORD_RESET_EMAIL}`;
  } finally {await boss.stop({graceful:true});await db.tenant.delete({where:{id:tenant.id}});}
 });
});
