export class LookupCache {
  constructor(){this.entries=new Map();this.pending=new Map();this.generation=0;}
  clear(){this.generation++;this.entries.clear();this.pending.clear();}
  async get(key,ttl,fetcher){
    const cached=this.entries.get(key);
    if(cached&&cached.expires>Date.now())return structuredClone(cached.value);
    let promise=this.pending.get(key);
    if(!promise){
      const generation=this.generation;
      promise=Promise.resolve().then(fetcher).then(value=>{
        if(generation===this.generation){if(this.entries.size>=200)this.entries.delete(this.entries.keys().next().value);this.entries.set(key,{value:structuredClone(value),expires:Date.now()+ttl});}
        return value;
      }).finally(()=>{if(this.pending.get(key)===promise)this.pending.delete(key);});
      this.pending.set(key,promise);
    }
    return structuredClone(await promise);
  }
}
export async function runLimited(items,limit,worker){
  let index=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const item=items[index++];await worker(item);}}));
}
