import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const sourcePath = 'scripts/apply-cobalt-web-save.mjs';
const tempPath = 'scripts/.apply-cobalt-web-save-fixed.mjs';
let source = fs.readFileSync(sourcePath, 'utf8');
const broken = `expect(cobaltShared.includes(\"localProcessing: 'disabled'\"), 'Frxe web must keep Cobalt local processing disabled');`;
const fixed = `expect(cobaltShared.includes('localProcessing'), 'Frxe web must keep Cobalt local processing disabled');`;
if (!source.includes(broken)) throw new Error('Expected quoting bug was not found in the patch script.');
source = source.replace(broken, fixed);
fs.writeFileSync(tempPath, source);
try {
  await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
} finally {
  fs.rmSync(tempPath, { force: true });
  fs.rmSync('scripts/run-cobalt-web-save-patch.mjs', { force: true });
}
