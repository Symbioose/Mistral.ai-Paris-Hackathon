// Copies TalkingHead and the three.js modules it needs into public/vendor so the
// browser loads them as native ES modules (via the import map in app/layout.tsx).
// TalkingHead uses runtime dynamic imports that bundlers cannot resolve.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const modules = path.join(root, 'node_modules');
const out = path.join(root, 'public/vendor');

// Copies a module and, recursively, every relative module it imports.
function copyGraph(sourceRoot, relative, targetRoot, seen = new Set()) {
  if (seen.has(relative)) return;
  seen.add(relative);
  const source = path.join(sourceRoot, relative);
  const target = path.join(targetRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const code = fs.readFileSync(source, 'utf8');
  fs.writeFileSync(target, code);
  for (const [, spec] of code.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    copyGraph(sourceRoot, path.join(path.dirname(relative), spec), targetRoot, seen);
  }
}

const three = path.join(modules, 'three');
copyGraph(path.join(three, 'build'), 'three.module.js', path.join(out, 'three'));
for (const addon of [
  'controls/OrbitControls.js',
  'loaders/GLTFLoader.js',
  'loaders/DRACOLoader.js',
  'loaders/FBXLoader.js',
  'environments/RoomEnvironment.js',
  'libs/stats.module.js',
]) copyGraph(path.join(three, 'examples/jsm'), addon, path.join(out, 'three/addons'));
fs.copyFileSync(path.join(three, 'LICENSE'), path.join(out, 'three/LICENSE'));

const head = path.join(modules, '@met4citizen/talkinghead');
copyGraph(path.join(head, 'modules'), 'talkinghead.mjs', path.join(out, 'talkinghead'));
copyGraph(path.join(head, 'modules'), 'lipsync-fr.mjs', path.join(out, 'talkinghead'));
fs.copyFileSync(path.join(head, 'modules/playback-worklet.js'), path.join(out, 'talkinghead/playback-worklet.js'));
fs.copyFileSync(path.join(head, 'LICENSE'), path.join(out, 'talkinghead/LICENSE'));

console.log('[vendor-avatar] TalkingHead and three.js copied to public/vendor');
