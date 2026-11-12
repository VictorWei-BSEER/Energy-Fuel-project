#!/usr/bin/env node
/** Rebuild/check the frozen synthetic dataset without network, random input or clock. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildScenarioDataset, GEOGRAPHY_PROVENANCE } from '../dist/scenario-data.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const argumentsList = process.argv.slice(2);
let check = false;
let output = resolve(root, 'dist/data/scenario-dataset.json');
while (argumentsList.length) {
  const argument = argumentsList.shift();
  if (argument === '--check') check = true;
  else if (argument === '--output' && argumentsList.length) output = resolve(argumentsList.shift());
  else throw new Error('Usage: node scripts/build_scenario_data.mjs [--check] [--output PATH]');
}
const geography = JSON.parse(await readFile(resolve(root, 'dist/data/global-airports.json'), 'utf8'));
if (geography.source.snapshotSha256 !== GEOGRAPHY_PROVENANCE.snapshotSha256 || geography.fetchedAt !== GEOGRAPHY_PROVENANCE.snapshotRetrievedAt)
  throw new Error('Geography provenance changed. Review the sourced snapshot before updating scenario-data.js metadata.');
const dataset = buildScenarioDataset();
const records = new Map(geography.records.map(record => [record.code, record]));
for (const row of dataset.records) {
  const source = records.get(row.code);
  if (!source || source.lat !== row.airport.lat || source.lon !== row.airport.lon)
    throw new Error(`Coordinate mismatch for ${row.code}.`);
}
const contents = JSON.stringify(dataset, null, 2) + '\n';
if (check) {
  const stored = await readFile(output, 'utf8');
  if (stored !== contents) throw new Error(`Synthetic dataset differs from its deterministic source: ${output}`);
  console.log(`Verified ${dataset.records.length} deterministic synthetic airport records.`);
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, contents);
  console.log(`Built ${dataset.records.length} synthetic airport records: ${output}`);
}
