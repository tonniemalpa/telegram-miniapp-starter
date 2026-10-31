import { EndpointError } from 'sdk';

// Limits for the user-data recipe. Every endpoint uses ctx.initData.user.id
// as the owner, so users can only ever see and change their own notes.
export const noteLimits = {
  maxLength: 500,
  maxPerUser: 100,
};

export function cleanNoteText(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) throw new EndpointError('Write something first.', { code: 'EMPTY' });
  if (text.length > noteLimits.maxLength) {
    throw new EndpointError(`Keep it under ${noteLimits.maxLength} characters.`, { code: 'TOO_LONG' });
  }
  return text;
}

export function publicNote(n) {
  return { id: n.id, text: n.text, createdAt: n.createdAt ?? null };
}
