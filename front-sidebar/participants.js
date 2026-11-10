export function normalizePhone(value) {
  const raw = String(value || '').replace(/^whatsapp:/i, '').trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '').replace(/^00/, '');
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : '';
}
export function mergeParticipants(recipients, messages = []) {
  const people = new Map();
  const add = (recipient, role) => {
    if (!recipient) return;
    if (recipient.type === 'phone' || recipient.type === 'custom') {
      const phone = normalizePhone(recipient.handle);
      if (phone && phone !== '+14242391356' && !people.has(phone)) people.set(phone, {phone, name: recipient.name || '', roles: []});
      return;
    }
    if (recipient.type !== 'email') return;
    const email = String(recipient.handle || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      if (['minmaxdeals.com','exporters.sg'].includes(email.split('@')[1])) return;
      if (email === '3249bln_kq4g6ke@mails5.zohocrm.com') return;
    if (!people.has(email)) people.set(email, {email, name: recipient.name || '', roles: []});
    const person = people.get(email);
    if (!person.name && recipient.name) person.name = recipient.name;
    if (role && !person.roles.includes(role)) person.roles.push(role);
  };
  for (const recipient of recipients) add(recipient);
  for (const message of messages.filter(Boolean)) {
    add(message.from, 'From');
    for (const recipient of message.to || []) add(recipient, 'To');
    for (const recipient of message.cc || []) add(recipient, 'CC');
    for (const recipient of message.bcc || []) add(recipient, 'BCC');
  }
  return [...people.values()];
}
