import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const retiredFiles = [
  'src/music/polish.css',
  'src/web-player-link.css',
  'docs/superpowers/specs/2026-09-14-nont-me-github-app-hub-design.md',
];

test('retired implementation and planning files stay out of the repository', () => {
  for (const file of retiredFiles) {
    assert.equal(fs.existsSync(file), false, `${file} should be removed`);
  }
});
