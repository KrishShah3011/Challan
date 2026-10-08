import { writeFileSync } from 'node:fs';
import { localEnv } from '../tests/helpers/localEnv';

const env = localEnv();
writeFileSync('.env.local', `VITE_SUPABASE_URL=${env.url}\nVITE_SUPABASE_ANON_KEY=${env.anonKey}\n`);
console.log('Wrote .env.local for the local Supabase stack.');
