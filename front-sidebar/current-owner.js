export function currentOwnerId(users,teammate){
  const email=String(teammate?.email||'').trim().toLowerCase();
  const matches=email?users.filter(user=>String(user.email||'').trim().toLowerCase()===email):[];
  if(matches.length)return matches.length===1?String(matches[0].id):'';
  const normalize=value=>String(value||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const name=normalize(teammate?.name);
  if(!name)return '';
  const names=users.filter(user=>normalize(user.name)===name);
  return names.length===1?String(names[0].id):'';
}
