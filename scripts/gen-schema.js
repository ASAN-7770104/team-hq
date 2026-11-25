import { writeFileSync, mkdirSync } from 'node:fs';
import { schemaSql } from '../src/schema.js';

const folder = new URL('../migrations/', import.meta.url);
mkdirSync(folder, { recursive: true });
writeFileSync(new URL('0001_init.sql', folder), schemaSql());
console.log('migrations/0001_init.sql updated');
