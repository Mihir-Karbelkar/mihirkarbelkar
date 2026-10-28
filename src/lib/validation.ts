import type { ChatMessage } from './contracts';
export function validMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 6 &&
    value.every(
      (m) =>
        m &&
        ['user', 'assistant'].includes(m.role) &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0 &&
        m.content.length <= 1800,
    ) &&
    value[value.length - 1].role === 'user'
  );
}
export function validateContact(body: any) {
  return (
    !!body &&
    typeof body.name === 'string' &&
    body.name.trim().length > 0 &&
    body.name.length <= 100 &&
    typeof body.email === 'string' &&
    body.email.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.email) &&
    !/[\r\n]/.test(body.email) &&
    typeof body.message === 'string' &&
    body.message.trim().length >= 10 &&
    body.message.length <= 5000 &&
    (body.projectType === undefined ||
      (typeof body.projectType === 'string' && body.projectType.length <= 100))
  );
}
