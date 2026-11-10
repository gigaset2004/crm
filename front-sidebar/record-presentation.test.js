import test from 'node:test';
import assert from 'node:assert/strict';
import {recordEmails,showRecordTitle,applyTextUpdate} from './record-presentation.js';
test('all CRM emails are normalized and deduplicated',()=>{
 assert.deepEqual(recordEmails({email:'RF@Example.com',emails:['rf@example.com','Other@Example.com']}),['rf@example.com','other@example.com']);
});
test('Customer Title is optional; logistics Title stays visible',()=>{
 assert.equal(showRecordTitle({type:'Customer',title:'CEO'}),true);
 assert.equal(showRecordTitle({type:'Customer',title:''}),false);
 assert.equal(showRecordTitle({type:'Broker',title:''}),true);
 assert.equal(showRecordTitle({type:'Supplier',title:'CEO'}),false);
});
test('Title edits update every copy of the same CRM record, never the phone',()=>{
 const first={id:'1',module:'Contacts',title:'Old',mobile:'123'},second={...first},other={...first,module:'Leads'};
 const records=new Map([['a',[first,other]],['b',[second]]]);
 applyTextUpdate(records,first,{field:'Title',value:'Director'});
 assert.equal(first.title,'Director');assert.equal(second.title,'Director');assert.equal(other.title,'Old');assert.equal(first.mobile,'123');
 applyTextUpdate(records,first,{field:'Title',value:''});assert.equal(first.title,'');assert.equal(second.title,'');
});
