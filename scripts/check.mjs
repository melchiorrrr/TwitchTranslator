import { readFile, access, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const extension = join(root, 'extension');
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest V3 is required');
if (manifest.permissions.some(permission => permission !== 'storage')) throw new Error('Unexpected permission');
const resources = [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => [...script.js, ...script.css])];
await Promise.all(resources.map(resource => access(join(extension, resource))));
async function checkDirectory(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await checkDirectory(path);
    else if (/\.m?js$/.test(entry.name)) {
      const checked = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (checked.status) throw new Error(checked.stderr);
    }
  }
}
await checkDirectory(extension);
console.log('Manifest resources, permissions and JavaScript syntax are valid.');
