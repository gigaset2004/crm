import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui = readFileSync(new URL('./orders-tabs.js',import.meta.url),'utf8');
const deployed = readFileSync(new URL('./public/app-2.0.1.js',import.meta.url),'utf8');
const bridge = readFileSync(new URL('./src.js',import.meta.url),'utf8');
const bundledBridge = readFileSync(new URL('./public/app-2.0.js',import.meta.url),'utf8');

test('Editable source and deployed tabs remain in sync', () => {
  assert.equal(ui,deployed);
});
test('Tabs have short singular labels without counters', () => {
  assert.match(ui,/\['shipments','Shipment','Shipments'\]/);
  assert.match(ui,/escapeHtml\(label\) \+ '<\/button>'/);
  assert.doesNotMatch(ui,/escapeHtml\(label \+ count\)/);
});
test('Blueprint opens Zoho record through Front instead of executing a transition', () => {
  assert.match(ui,/data-blueprint-link/);
  assert.match(ui,/crm\.zoho\.com\/crm\/minmaxdeals\/tab\//);
  assert.match(ui,/__minmaxOpenCrmUrl\(link\.href\)/);
  assert.doesNotMatch(ui,/blueprint_transition/);
  assert.doesNotMatch(ui,/data-blueprint-submit/);
});
test('Both source and bundle expose the existing Front openUrl operation', () => {
  assert.match(bridge,/return next\.openUrl\(url\)/);
  assert.match(bundledBridge,/return e\.openUrl\(url\)/);
});
test('Shipment current status and type share one badge row', () => {
  assert.match(ui,/crm-order-badges/);
  assert.match(ui,/statusTag \+ typeTag/);
  assert.doesNotMatch(ui,/crm-shipment-status/);
});
