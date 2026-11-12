import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderWorkspaceDirectory } from '../dist/workspace-directory.js';
import { airportData } from '../dist/global-airports.js';

test('regional traffic directory identifies the separate current global model coverage', () => {
  const { document } = parseHTML('<div id="flight-map"></div><p id="directory-method"></p><table><tbody id="directory-rows"></tbody></table><div id="directory-sources"></div>');
  assert.equal(renderWorkspaceDirectory(document), true);
  assert.match(document.querySelector('#directory-method').textContent, new RegExp(`全球 ${airportData.length} 个机场`));
  assert.doesNotMatch(document.querySelector('#directory-method').textContent, /支持的 17/);
  assert.equal(document.querySelectorAll('#directory-rows tr').length, 50);
});
