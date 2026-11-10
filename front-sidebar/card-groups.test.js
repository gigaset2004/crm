import assert from 'node:assert/strict';
import {availableCategories,sortRecords} from './card-groups.js';
const records=[{type:'Warehouse',id:1},{type:'Supplier',id:2},{type:'Warehouse',id:3},{type:'Customer',id:4},{type:'',id:5}];
assert.deepEqual(sortRecords(records).map(r=>r.id),[4,2,1,3,5]);
assert.deepEqual(availableCategories(records.slice(0,3)),['Supplier','Warehouse']);
assert.deepEqual(availableCategories([],0),[]);
assert.deepEqual(availableCategories([],1),['Unknown']);
assert.deepEqual(availableCategories([{type:' customer '}]),['Customer']);
console.log('Dynamic filter presence and stable category ordering checks passed.');
