const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const scripts = ['Fill_with_AI_BUTTON', 'Sales_Orders_CREATE_onLoad'];
const copy = value => JSON.parse(JSON.stringify(value));

function run(name, options = {}) {
    const source = fs.readFileSync(path.join(__dirname, '../client-scripts', name + '_v1.40.js'), 'utf8');
    const state = {rows: [], alerts: [], messages: [], writes: 0, popups: 0, status: null};
    const field = {
        getValue() { if (options.readError) throw options.readError; return copy(state.rows); },
        setValue(rows) { state.writes++; state.rows = copy(rows); }
    };
    const subform = {
        getValues() { return copy(state.rows); },
        setValues(rows) { state.writes++; state.rows = copy(rows); },
        getRow(index) {
            if (!state.rows[index]) return null;
            return {
                getValues() { return copy(state.rows[index]); },
                setValues(values) { state.writes++; Object.assign(state.rows[index], copy(values)); },
                getCell(key) { return {setValue(value) { state.writes++; state.rows[index][key] = copy(value); }}; }
            };
        },
        insertRows(rows, index) { state.writes++; state.rows.splice(index, 0, ...copy(rows)); },
        deleteRow(index) { state.writes++; state.rows.splice(index, 1); }
    };
    const context = {
        $Page: {navigation_data: {ai_order_builder_launch: '1.10'}},
        $Client: {url: ''},
        ZDK: {
            Page: {
                getField(name) { return name === 'Ordered_Items' ? field : {setValue(value) { state.status = value; }}; },
                getSubform() { return subform; }
            },
            Client: {
                hideLoader() {},
                openPopup() {
                    state.popups++;
                    if (Object.prototype.hasOwnProperty.call(options, 'popupError')) throw options.popupError;
                    return options.reply;
                },
                showAlert(message, title) { state.alerts.push({message, title}); },
                showMessage(message) { state.messages.push(message); }
            }
        }
    };
    vm.runInNewContext(source, context, {filename: name, timeout: 1000});
    return {state, bridge: context.aiBridgeV140};
}

const cancellations = [
    'widget_closed',
    '  WIDGET_CLOSED  ',
    'Opening AI widget: widget_closed',
    'Error: Opening AI widget: widget_closed.',
    new Error('widget_closed'),
    {code: 'widget_closed'},
    {message: 'Popup was dismissed', code: 'widget_closed'},
    {error: {code: 'widget_closed'}},
    {reason: 'widget_closed'},
    {cause: new Error('widget_closed')}
];

for (const name of scripts) {
    for (const cancellation of cancellations) {
        const {state} = run(name, {popupError: cancellation});
        assert.equal(state.popups, 1);
        assert.equal(state.alerts.length, 0, name + ': normal close must not alert');
        assert.equal(state.writes, 0, name + ': normal close must not write SO rows');
    }
    for (const reply of [null, undefined, '', 'widget_closed', {code: 'widget_closed'}]) {
        const {state} = run(name, {reply});
        assert.equal(state.alerts.length, 0, name + ': returned cancellation must not alert');
        assert.equal(state.writes, 0);
    }
    for (const popupError of [
        new Error('Access denied'),
        {code: 'WIDGET_NOT_FOUND'},
        'widget_closed because initialization failed',
        new Error('Cannot handle widget_closed event'),
        {message: 'Network error', code: 'ECONNRESET'}
    ]) {
        const {state} = run(name, {popupError});
        assert.equal(state.alerts.length, 1, name + ': genuine popup error must alert');
        assert.match(state.alerts[0].message, /^Opening AI widget: /);
        assert.equal(state.writes, 0);
    }
    const cyclic = {message: 'SDK error'};
    cyclic.cause = cyclic;
    assert.equal(run(name, {popupError: cyclic}).state.alerts.length, 1);
    const readFailure = run(name, {readError: new Error('Inventory unavailable')}).state;
    assert.match(readFailure.alerts[0].message, /^Reading SO products: Inventory unavailable$/);
    assert.equal(readFailure.popups, 0);

    const invalid = run(name, {reply: {unexpected: true}}).state;
    assert.match(invalid.alerts[0].message, /^Updating SO from Fill Sales Order: /);
    assert.equal(invalid.writes, 0);

    const row = {
        Product_Name: {id: '1234567890123456', name: 'Test Product'},
        Offer_Product_Name: 'Supplier Product', Quantity: 3, List_Price: '27.15',
        Supplier: {id: '2345678901234567', name: 'SUP-01'},
        UPC: '1234567890123', Brand: 'Test Brand', HS_Code: '330499', Country_of_origin: 'France'
    };
    const {state, bridge} = run(name, {reply: {
        ai_order_builder: '1.9', ai_order_builder_mode: 'sync_1.30', Ordered_Items: [row]
    }});
    assert.equal(bridge.version, '1.40');
    assert.deepEqual(state.alerts, []);
    assert.equal(state.messages.length, 1);
    assert.equal(state.status, 'Requested');
    assert.deepEqual(state.rows, [{...row, List_Price: 27.15}]);
    bridge.showError(new Error('Opening AI widget: widget_closed'));
    assert.equal(state.alerts.length, 0);
    bridge.showError(new Error('Save rejected'));
    assert.equal(state.alerts[0].message, 'Save rejected');
    console.log('PASS ' + name + ': normal close, real errors, unchanged Fill Sales Order');
}
