// Never derive a supposedly complete roster from SDK messages: Front only
// exposes messages already loaded on screen. The server follows Core API pages.
export async function loadConversationParticipants(context, request, force=false) {
  const id=context.conversation?.id;
  if(!/^cnv_[a-z0-9]+$/i.test(id||''))throw new Error('Invalid Front conversation.');
  const data=await request('participants',{conversation_id:id,...(force?{refresh:'1'}:{})});
  if(data.complete!==true||!Array.isArray(data.recipients))throw new Error('The complete participant list could not be loaded. Please retry.');
  return data.recipients;
}
