import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

await build({
  entryPoints: ['src/planner.js'],
  outfile: 'dist/planner.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'eof',
  banner: { js: '/* Fuel Atlas planning engine. Source: src/planner.js. Third-party license: vendor-licenses.txt */' },
});
const require = createRequire(import.meta.url);
const solverRoot = dirname(require.resolve('javascript-lp-solver/package.json'));
const license = await readFile(join(solverRoot, 'LICENSE'), 'utf8');
await writeFile('dist/vendor-licenses.txt', `javascript-lp-solver\nhttps://github.com/JWally/jsLPSolver\n\n${license}\n`);
console.log('Built browser planning engine and bundled license.');
