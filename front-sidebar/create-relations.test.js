import test from 'node:test';
import assert from 'node:assert/strict';
import {relationRequired} from './create-relations.js';
test('Customer Account is optional for Leads and Contacts; other relations remain required',()=>{
 assert.equal(relationRequired('Leads','Customer'),false);
 assert.equal(relationRequired('Contacts','Customer'),false);
 assert.equal(relationRequired('Leads','Supplier'),true);
 assert.equal(relationRequired('Contacts','Supplier'),true);
 for(const type of ['Warehouse','Broker','Carrier','Forwarder'])assert.equal(relationRequired('Contacts',type),true);
});
