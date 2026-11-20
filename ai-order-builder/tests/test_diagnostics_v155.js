const assert = require('node:assert/strict');
const Diagnostics = require('../widget/app/diagnostics.js');

function item(index, extras) {
    return Object.assign({
        identifier: '123456789012' + index,
        requestedName: 'Product ' + index,
        quantity: 1,
        price: 10,
        product: {id: String(index), Product_Name: 'Product ' + index}
    }, extras);
}

const items = [
    item(1, {product: {id: '1', HS_Code: '330499', Country_of_origin: ''}}),
    item(2, {hsManual: '', cooManual: ' ', product: {id: '2', HS_Code: '330499', Country_of_origin: 'France'}}),
    item(3, {hsManual: '33049990', cooManual: 'Japan', product: {id: '3', HS_Code: '330499', Country_of_origin: 'France'}}),
    item(4, {research: {hs_code: '330410', country_of_origin: 'Italy'}}),
    item(5, {hsManual: null, cooManual: null, research: {hs_code: '330499', country_of_origin: 'France'}})
];
const original = JSON.stringify(items);
const log = new Diagnostics('1.55');
log.add('service_response', {stage: 'research', status: 200, request_id: 'request-1', duration_ms: 66});
log.add('research_item', {
    stage: 'verified', request_id: 'request-1', upc: '1234567890121',
    coo_found: false, hs_digits: 0, cache_hit: true,
    coo_error: 'missing_value', hs_error: 'value_not_in_quote',
    token: 'SECRET_TOKEN', authorization: 'Bearer SECRET_TOKEN',
    body: 'PRIVATE_REQUEST_BODY', message: 'PRIVATE_REQUEST_BODY'
});
log.add('research_item', {
    stage: 'verified', upc: '0123456789012', coo_found: true,
    hs_digits: 6, cache_hit: false, coo_error: 'none', hs_error: 'none'
});
log.add('service_error', {error_code: 'network_error', message: 'Search timed out'});

const report = log.report(items);
assert.match(report, /Version: 1\.55/);
assert.match(report, /4\. ITEMS THAT STILL NEED ATTENTION \(0\)\nNone\./);
assert.match(report, /4a\. OPTIONAL HS \/ COO \(not required for Fill Sales Order\)/);
assert.match(report, /Missing HS: 2 \| Missing COO: 3/);
assert.match(report, /#1 \| UPC 1234567890121 \| HS: 330499 \| COO: MISSING/);
assert.match(report, /#2 \| UPC 1234567890122 \| HS: MISSING \| COO: MISSING/);
assert.match(report, /#3 \| UPC 1234567890123 \| HS: 33049990 \| COO: Japan/);
assert.match(report, /#4 \| UPC 1234567890124 \| HS: 330410 \| COO: Italy/);
assert.match(report, /#5 \| UPC 1234567890125 \| HS: MISSING \| COO: MISSING/);
assert.match(report, /Order quantity: 5 \| Order total: \$50\.00/);
assert.match(report, /5\. ALL ORDER ROWS/);
assert.match(report, /service_response \[research\] status=200 time=66ms/);
assert.match(report, /research_item \[verified\] upc=1234567890121 coo_found=false hs_digits=0 cache_hit=true coo_error=missing_value hs_error=value_not_in_quote/);
assert.match(report, /upc=0123456789012 coo_found=true hs_digits=6 cache_hit=false coo_error=none hs_error=none/);
assert.match(report, /service_error error=network_error Search timed out/);
assert.match(report, /Request IDs for support: request-1\n/);
assert.doesNotMatch(report, /SECRET_TOKEN|PRIVATE_REQUEST_BODY|authorization|Bearer/);
assert.equal(JSON.stringify(items), original, 'Reporting must not change line values or their validation');

const unsafe = new Diagnostics('1.55');
unsafe.add('research_item', {
    upc: 'Bearer SECRET_TOKEN', coo_found: 'SECRET_TOKEN', hs_digits: 'SECRET_TOKEN',
    cache_hit: 'SECRET_TOKEN', coo_error: 'Bearer SECRET_TOKEN', hs_error: 'PRIVATE_REQUEST_BODY',
    request_body: 'PRIVATE_REQUEST_BODY', headers: {authorization: 'SECRET_TOKEN'}
});
assert.equal(unsafe.events[0].coo_error, 'unrecognized_validation_error');
assert.equal(unsafe.events[0].hs_error, 'unrecognized_validation_error');
assert.equal(unsafe.events[0].upc, undefined);
assert.equal(unsafe.events[0].coo_found, undefined);
assert.equal(unsafe.events[0].hs_digits, undefined);
assert.equal(unsafe.events[0].cache_hit, undefined);
assert.doesNotMatch(unsafe.report([]), /SECRET_TOKEN|PRIVATE_REQUEST_BODY|authorization|Bearer/);
assert.match(unsafe.report([]), /Missing HS: 0 \| Missing COO: 0\nNo order rows\./);
console.log('PASS v1.55 diagnostics: optional customs, manual empty values, cache/validation events, safe fields');
