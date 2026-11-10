export function recordEmails(record) {
  return [...new Set([...(record.emails||[]),record.email].filter(Boolean).map(value=>String(value).trim().toLowerCase()))];
}
export function showRecordTitle(record) {
  const type=String(record.type||'').trim().toLowerCase();
  return ['warehouse','broker','carrier','forwarder'].includes(type)||(type==='customer'&&!!String(record.title||'').trim());
}
export function applyTextUpdate(recordsByEmail,record,saved){
  const field={Phone:'phone',Mobile:'mobile',Title:'title'}[saved.field];
  for(const rows of recordsByEmail.values())for(const row of rows)if(row.id===record.id&&row.module===record.module){
    if(saved.field==='Name'){row.last_name=saved.last_name;row.first_name=saved.first_name;}
    else if(field)row[field]=saved.value;
  }
}
