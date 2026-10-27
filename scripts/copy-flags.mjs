// Copies the flags the site needs from the flag-icons package into public/flags/,
// so pages never hot-link a flag CDN. Runs before `dev` and `build`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/flag-icons/flags/4x3');
const out = path.join(root, 'public/flags');
const countries = JSON.parse(fs.readFileSync(path.join(root, 'content/countries.json'), 'utf8'));

// Historical flags flag-icons doesn't ship.
const custom = {
  // Serbia and Montenegro (2003–2006): blue, white, red.
  cs: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#c6363c" d="M0 0h640v480H0z"/><path fill="#fff" d="M0 0h640v320H0z"/><path fill="#0c4076" d="M0 0h640v160H0z"/></svg>',
  // SFR Yugoslavia: the same tricolour with a gold-edged red star.
  yu: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#c6363c" d="M0 0h640v480H0z"/><path fill="#fff" d="M0 0h640v320H0z"/><path fill="#0c4076" d="M0 0h640v160H0z"/><path fill="#c6363c" stroke="#fedf00" stroke-width="10" d="m320 98 35 108h114l-92 67 35 108-92-67-92 67 35-108-92-67h114z"/></svg>',
};

fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const code of Object.keys(countries)) {
  const dest = path.join(out, code + '.svg');
  if (custom[code]) fs.writeFileSync(dest, custom[code]);
  else if (fs.existsSync(path.join(src, code + '.svg'))) fs.copyFileSync(path.join(src, code + '.svg'), dest);
  else {
    console.warn(`copy-flags: no flag for "${code}"`);
    continue;
  }
  n++;
}
console.log(`copy-flags: ${n} flags in public/flags`);
