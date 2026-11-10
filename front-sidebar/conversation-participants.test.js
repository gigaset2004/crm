import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConversationParticipants} from './conversation-participants.js';
import {mergeParticipants} from './participants.js';
test('uses complete server roster, not visible SDK messages',async()=>{
 const recipients=['rf@rftradingalliance.com','r.ferraz@doctorskinonline.com'].map(handle=>({type:'email',handle}));
 const context={conversation:{id:'cnv_1gsaz26q'},listMessages(){throw new Error('must not use SDK');}};
 const result=await loadConversationParticipants(context,async(action,args)=>{assert.equal(action,'participants');assert.equal(args.conversation_id,'cnv_1gsaz26q');return {complete:true,recipients};});
 assert.equal(mergeParticipants(result).length,2);
});
test('incomplete results never become a cached roster',async()=>{
 await assert.rejects(()=>loadConversationParticipants({conversation:{id:'cnv_1gsaz26q'}},async()=>({complete:false,recipients:[]})));
});
test('manual refresh bypasses server cache',async()=>{
 await loadConversationParticipants({conversation:{id:'cnv_1gsaz26q'}},async(_,args)=>{assert.equal(args.refresh,'1');return {complete:true,recipients:[]};},true);
});
