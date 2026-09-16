import { describe, it, expect, vi } from 'vitest';
const storage = vi.hoisted(() => ({ send: vi.fn(async()=>({})) }));
vi.mock('~/env',()=>({env:{NODE_ENV:'test',R2_ACCOUNT_ID:'fake',R2_ACCESS_KEY_ID:'fake',R2_SECRET_ACCESS_KEY:'fake',R2_BUCKET_NAME:'fake'}}));
vi.mock('@aws-sdk/client-s3',()=>({S3Client:class {send=storage.send},DeleteObjectCommand:class {constructor(public input:unknown){}}}));
describe.skipIf(process.env.RUN_INTEGRATION_TESTS!=='true')('R2 reference lifecycle with PostgreSQL',()=>{
 it('a concurrent live reference wins its lock before deletion and preserves the object',async()=>{
  const {db}=await import('~/server/db');
  const {deleteR2ObjectBestEffort,withMediaLock}=await import('./r2-client');
  const tenant=await db.tenant.create({data:{name:'R2 audit'}});
  try {
   const item=await db.catalogueItem.create({data:{tenantId:tenant.id,code:'A1',quantity:1}});
   const key=`tenants/${tenant.id}/catalogue-items/${item.id}/photo`;
   const session=await db.liveSession.create({data:{tenantId:tenant.id,lastActivityAt:new Date()}});
   let entered!:()=>void; const ready=new Promise<void>(r=>entered=r);
   let release!:()=>void; const gate=new Promise<void>(r=>release=r);
   const copy=withMediaLock(key,async tx=>{
    entered(); await gate;
    await tx.liveItem.create({data:{tenantId:tenant.id,liveSessionId:session.id,code:'A1',mediaStorageKey:key}});
   });
   await ready;
   const deletion=deleteR2ObjectBestEffort(tenant.id,item.id,key);
   release(); await copy;
   expect(await deletion).toBe(false); expect(storage.send).not.toHaveBeenCalled();
   await db.liveItem.deleteMany({where:{tenantId:tenant.id}});
   const {createLiveItem} = await import('~/server/live-item/createLiveItem');
   await expect(withMediaLock(key, async tx => {
     await createLiveItem(tenant.id, 'A2', {mediaStorageKey:key}, tx);
     throw new Error('rollback');
   })).rejects.toThrow('rollback');
   expect(await db.liveItem.count({where:{tenantId:tenant.id}})).toBe(0);
   expect(await deleteR2ObjectBestEffort(tenant.id,item.id,key)).toBe(true);
   expect(storage.send).toHaveBeenCalledTimes(1);
  } finally {await db.tenant.delete({where:{id:tenant.id}});}
 });
});
