'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const result = spawnSync('npx', ['--yes', '--package=esbuild@0.25.5', 'esbuild', 'pet/puppy-world.js', '--bundle', '--format=iife', '--target=es2020', '--minify', '--legal-comments=linked', '--outfile=pet/puppy-world.bundle.js'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
fs.appendFileSync(path.join(root, 'pet/puppy-world.bundle.js.LEGAL.txt'), '\n' + fs.readFileSync(path.join(root, 'pet/vendor/THREE-LICENSE.txt'), 'utf8'));
