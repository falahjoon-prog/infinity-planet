import crypto from 'crypto';
export const hashToken = (t: string) => crypto.createHash('sha256').update(`sign:${t}`).digest('hex');
export const newToken = () => crypto.randomBytes(24).toString('base64url');
export type SignField = { page: number; x: number; y: number; w: number; h: number; kind: 'signature' | 'initials' | 'date' | 'name' | 'text'; label?: string; required?: boolean };
