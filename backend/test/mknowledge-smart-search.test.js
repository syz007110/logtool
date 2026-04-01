const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldUseMKnowledgeForIntent,
  mapMKnowledgeHitsToKbDocs,
  buildMKnowledgeSearchBody
} = require('../src/services/mKnowledgeSmartSearchService');

test('shouldUseMKnowledgeForIntent only enables definition/how_to_use', () => {
  assert.equal(shouldUseMKnowledgeForIntent('definition'), true);
  assert.equal(shouldUseMKnowledgeForIntent('how_to_use'), true);
  assert.equal(shouldUseMKnowledgeForIntent('troubleshoot'), false);
  assert.equal(shouldUseMKnowledgeForIntent('find_case'), false);
});

test('mapMKnowledgeHitsToKbDocs maps multi hits to kbDocs shape and caps to five', () => {
  const payload = {
    hits: Array.from({ length: 8 }, (_, i) => ({
      ref: `K${i + 1}`,
      title: `Doc ${i + 1}`,
      headingPath: `Heading ${i + 1}`,
      snippet: `Snippet ${i + 1}`,
      sourceRef: { chunkId: `chunk-${i + 1}` }
    }))
  };

  const kbDocs = mapMKnowledgeHitsToKbDocs(payload);
  assert.equal(kbDocs.length, 5);
  assert.equal(kbDocs[0].ref, 'K1');
  assert.equal(kbDocs[4].ref, 'K5');
});

test('buildMKnowledgeSearchBody keeps query for vector and sends keywords separately for ES', () => {
  const payload = buildMKnowledgeSearchBody({
    collectionId: 7,
    query: 'how to configure clutch',
    keywords: ['clutch', 'api'],
    limit: 3
  });
  assert.deepEqual(payload, {
    collectionId: 7,
    query: 'how to configure clutch',
    keywords: ['clutch', 'api'],
    esTopK: 3,
    vecTopK: 3,
    fuseTopK: 3
  });
});

test('buildMKnowledgeSearchBody falls back query to keywords join when query empty', () => {
  const payload = buildMKnowledgeSearchBody({
    collectionId: 1,
    query: '   ',
    keywords: ['alpha', 'beta'],
    limit: 5
  });
  assert.equal(payload.query, 'alpha beta');
  assert.deepEqual(payload.keywords, ['alpha', 'beta']);
});

test('buildMKnowledgeSearchBody sets generate when requested', () => {
  const payload = buildMKnowledgeSearchBody({
    collectionId: 1,
    query: 'q',
    keywords: [],
    limit: 5,
    generate: true
  });
  assert.equal(payload.generate, true);
});

