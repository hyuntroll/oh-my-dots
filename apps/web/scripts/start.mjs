import { cp } from 'node:fs/promises';
await cp(new URL('../.next/static/', import.meta.url), new URL('../.next/standalone/.next/static/', import.meta.url), { recursive: true });
await cp(new URL('../public/', import.meta.url), new URL('../.next/standalone/public/', import.meta.url), { recursive: true });
process.env.PORT ||= '3081';
process.env.HOSTNAME = '0.0.0.0';
await import('../.next/standalone/server.js');
