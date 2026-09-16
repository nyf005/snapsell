import { beforeEach, it, expect, vi } from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),count:vi.fn(),lock:vi.fn()}));
vi.mock('~/env',()=>({env:{R2_ACCOUNT_ID:'fake',R2_ACCESS_KEY_ID:'fake',R2_SECRET_ACCESS_KEY:'fake',R2_BUCKET_NAME:'fake'}}));
vi.mock('@aws-sdk/client-s3',()=>({S3Client:class {send=mocks.send},DeleteObjectCommand:class {constructor(public input:unknown){}}}));
vi.mock('~/server/db',()=>({db:{$transaction:async(work:(tx:unknown)=>unknown)=>work({$executeRaw:mocks.lock,catalogueItem:{count:mocks.count},liveItem:{count:mocks.count},paymentProof:{count:mocks.count},reservation:{count:mocks.count}})}}));
import {deleteR2ObjectBestEffort} from './r2-client';
import {createCatalogueItemInputSchema,updateCatalogueItemInputSchema} from '~/server/api/routers/catalogue.schema';
const key='tenants/t/catalogue-items/i/photo';
beforeEach(()=>{vi.clearAllMocks();mocks.count.mockResolvedValue(0);mocks.send.mockResolvedValue({});});
it('rejects client supplied media keys',()=>{
 expect(createCatalogueItemInputSchema.safeParse({code:'A1',quantity:1,mediaStorageKey:key}).success).toBe(false);
 expect(updateCatalogueItemInputSchema.safeParse({id:'clx1234567890123456789012',mediaStorageKey:key}).success).toBe(false);
});
it('rejects foreign, inherited and malformed keys without calling R2',async()=>{
 for(const bad of ['tenants/other/catalogue-items/i/photo','tenants/t/live-items/i/media',key+'/../photo',key+'?x', 'tenants/t/catalogue-items/other/photo']) expect(await deleteR2ObjectBestEffort('t','i',bad)).toBe(false);
 expect(mocks.send).not.toHaveBeenCalled();
});
it('retains shared objects',async()=>{
 mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
 expect(await deleteR2ObjectBestEffort('t','i',key)).toBe(false);
 expect(mocks.send).not.toHaveBeenCalled();
});
it('deletes an unreferenced owned object after acquiring the lock',async()=>{
 expect(await deleteR2ObjectBestEffort('t','i',key)).toBe(true);
 expect(mocks.lock).toHaveBeenCalled();expect(mocks.send).toHaveBeenCalledTimes(1);
});
it('does not block deletion of the association when storage fails',async()=>{
 mocks.send.mockRejectedValue(new Error('offline'));
 expect(await deleteR2ObjectBestEffort('t','i',key)).toBe(false);
});
