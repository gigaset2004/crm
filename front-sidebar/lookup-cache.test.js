import assert from 'node:assert/strict';
import {LookupCache,runLimited} from './lookup-cache.js';
const cache=new LookupCache();let calls=0;
const fetcher=async()=>{calls++;return {name:'Original'};};
const [a,b]=await Promise.all([cache.get('a',1000,fetcher),cache.get('a',1000,fetcher)]);
assert.equal(calls,1);a.name='Edited';assert.equal(b.name,'Original');
assert.equal((await cache.get('a',1000,fetcher)).name,'Original');
cache.clear();await cache.get('a',1000,fetcher);assert.equal(calls,2);
let active=0,max=0;const seen=[];
await runLimited([1,2,3,4,5,6],3,async item=>{active++;max=Math.max(max,active);await Promise.resolve();seen.push(item);active--;});
assert.equal(max,3);assert.equal(seen.length,6);
let errors=0;for(let i=0;i<2;i++)try{await cache.get('error',1000,()=>{errors++;throw Error('test');});}catch{}
assert.equal(errors,2);
console.log('Cache deduplication, clone isolation, invalidation, uncached errors and concurrency checks passed.');
