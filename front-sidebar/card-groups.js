export const categoryOrder=['Customer','Supplier','Warehouse','Unknown'];
export function recordCategory(record){
  const type=String(record.type||'').trim();
  return categoryOrder.find(category=>category.toLowerCase()===type.toLowerCase())||(type||'Unknown');
}
export function availableCategories(records,unmatchedCount=0){
  const present=new Set(records.map(recordCategory));
  if(unmatchedCount)present.add('Unknown');
  return categoryOrder.filter(category=>present.has(category));
}
export function sortRecords(records){
  const rank=record=>{const category=recordCategory(record);const index=categoryOrder.indexOf(category);return index===-1?2.5:index;};
  return [...records].sort((a,b)=>rank(a)-rank(b));
}
