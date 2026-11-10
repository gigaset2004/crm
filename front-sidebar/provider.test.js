import assert from 'node:assert/strict';
import {providerValue,providerRecords} from './provider.js';
assert.deepEqual(providerRecords([{id:'4888374000124307263',Logistics_Services:{name:'RAM International Shipping',id:'4888374000124307200'}}]),[{name:'RAM International Shipping',id:'4888374000124307200',module:'CustomModule4'}]);
assert.equal(providerValue([{id:'4888374000124307263',Logistics_Services:{name:'RAM International Shipping',id:'4888374000124307200'}}]),'RAM International Shipping');
assert.equal(providerValue([{name:'One'},{Logistics_Services:{name:'Two'}}]),'One, Two');
assert.equal(providerValue(null),'');
assert.equal(providerValue({id:'123'}),'');
console.log('Provider format checks passed.');
