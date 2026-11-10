export function relationRequired(module,type){
  return type==='Customer'?false:type==='Supplier'||(module==='Contacts'&&['Warehouse','Broker','Carrier','Forwarder'].includes(type));
}
