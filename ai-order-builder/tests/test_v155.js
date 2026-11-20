'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'widget/app/widget.html'), 'utf8');
const Enricher = require('../widget/app/product-enrichment.js');
const clean = value => String(value == null ? '' : value).trim();
const copy = value => JSON.parse(JSON.stringify(value));

function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert(a >= 0 && b > a, start);
  return html.slice(a, b);
}

async function scenario({origin = null, evidence = true, oldOrigin = null, failure = false,
  oldHS = '3304.99', initialHS = '3304.99', fields = ['country_of_origin']} = {}) {
  const upc = '1234567890123', requests = [], writes = [];
  let product = {id: 'product-1', UPC: upc, Brand_text: 'Example Brand',
    Product_Name: 'Night Cream', HS_Code: oldHS, Country_of_origin: oldOrigin};
  const item = {identifier: upc, requestedName: 'Example Brand Night Cream 100ml',
    requestedBrand: 'Example Brand', offerName: 'Night Cream 100ml',
    quantity: 20, price: 27.15, product: copy(product), match: 'matched'};
  const context = {clean, AI_SERVICE_URL: 'https://service.example', aiSession: 'test-session',
    AbortController, setTimeout, clearTimeout, readableError: clean, clearAISession() {},
    fetch: async (url, options) => {
      assert.equal(url, 'https://service.example/v1/research');
      const body = JSON.parse(options.body);
      requests.push(body);
      for (const entry of body.products) {
        assert.deepEqual(Object.keys(entry).sort(), ['identifier', 'key', 'product_name']);
        assert.equal(entry.identifier, upc);
        assert(entry.product_name.length <= 255);
      }
      if (body.research_mode) {
        assert.equal(body.research_mode, 'customs');
        assert.deepEqual(body.research_fields, fields);
        assert.match(body.products[0].product_name, /100ml/);
        assert.match(body.products[0].product_name, /Supplier title:/);
      }
      if (failure && body.research_mode === 'customs') {
        return {ok: false, status: 503, json: async () => ({error: 'Temporary search failure'})};
      }
      const coo = body.research_mode === 'customs' ? origin : null;
      return {ok: true, status: 200, json: async () => ({items: [{
        key: '0', verified: true, upc, brand: 'Example Brand',
        product_name: 'Night Cream 100ml', hs_code: body.research_mode === 'customs' ? '3304.99' : initialHS, country_of_origin: coo,
        evidence: evidence && coo ? {country_of_origin: {
          value: coo, url: 'https://manufacturer.example/product', quote: 'Made in ' + coo
        }} : {}
      }]})};
    }};
  vm.createContext(context);
  vm.runInContext(section('    function researchProducts(', '    function researchOfficialRetry(') +
    section('    function researchMissingTrade(', '    async function enrichExisting('), context);
  const enricher = new Enricher({read: async () => copy(product),
    update: async patch => {writes.push(copy(patch)); Object.assign(product, patch);},
    research: batch => context.researchProducts(batch, {timeoutMs: 25000}),
    researchMetadata: context.researchMissingTrade,
    brandHint: () => 'Example Brand'});
  await enricher.run([item]);
  // Optional customs fields may never block a valid Sales Order row.
  Object.assign(context, {items: [item], offerNameFor: it => it.offerName,
    enteredNumber: value => value == null ? null : Number(value), priceFor: it => it.price});
  vm.runInContext(section('    function lineIssues(', '    function parseLines('), context);
  assert.equal(context.lineIssues(item, 0).length, 0);
  return {product, item, requests, writes};
}

(async () => {
  // Check the entire inline widget script for syntax errors, without executing UI.
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (match[1].trim()) new vm.Script(match[1]);
  }
  const result = await scenario({origin: 'Canada'});
  assert.equal(result.requests.length, 2);
  assert.equal(result.requests[0].research_mode, undefined);
  assert.equal(result.requests[1].research_mode, 'customs');
  assert.deepEqual(result.requests[1].research_fields, ['country_of_origin']);
  assert.equal(result.product.Country_of_origin, 'Canada');
  assert.equal(result.product.Product_Name, 'Night Cream');
  assert.deepEqual(result.writes, [{id: 'product-1', Country_of_origin: 'Canada'}]);
  assert.equal(result.item.product.Country_of_origin, 'Canada');

  const noEvidence = await scenario({origin: 'Canada', evidence: false});
  assert.equal(noEvidence.product.Country_of_origin, null);
  assert.equal(noEvidence.writes.length, 0);
  const unresolved = await scenario();
  assert.equal(unresolved.product.Country_of_origin, null);
  assert.equal(unresolved.writes.length, 0);
  const unavailable = await scenario({failure: true});
  assert.equal(unavailable.product.Country_of_origin, null);
  assert.equal(unavailable.writes.length, 0);
  const existing = await scenario({oldOrigin: 'Japan'});
  assert.equal(existing.requests.length, 0);
  assert.equal(existing.product.Country_of_origin, 'Japan');
  const onlyHS = await scenario({oldOrigin: 'Japan', oldHS: null, initialHS: null, fields: ['hs_code']});
  assert.equal(onlyHS.product.Country_of_origin, 'Japan');
  assert.deepEqual(onlyHS.writes, [{id: 'product-1', HS_Code: '3304.99'}]);
  const both = await scenario({origin: 'Canada', oldHS: null, initialHS: null, fields: ['country_of_origin', 'hs_code']});
  assert.deepEqual(both.writes, [{id: 'product-1', HS_Code: '3304.99', Country_of_origin: 'Canada'}]);
  console.log('PASS v1.55: distinct customs request, exact UPC and size hint, evidence-gated CRM readback, optional COO, existing data retained');
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
