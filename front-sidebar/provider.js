export function providerValue(value) {
  if (Array.isArray(value)) return value.map(providerValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    if (value.Logistics_Services) return providerValue(value.Logistics_Services);
    return String(value.name || value.display_value || '');
  }
  return String(value ?? '');
}
export function providerRecords(value) {
  if (Array.isArray(value)) return value.flatMap(providerRecords);
  if (!value || typeof value !== 'object') return [];
  if (value.Logistics_Services) return providerRecords(value.Logistics_Services);
  return value.name && value.id ? [{name:String(value.name),id:String(value.id),module:'CustomModule4'}] : [];
}
