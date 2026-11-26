const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/lib.js');

const autoCaptions = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: 'hello' }, { utf8: ' everyone', tOffsetMs: 400 }, { utf8: ' and', tOffsetMs: 900 }] },
    { tStartMs: 2000, dDurationMs: 10, aAppend: 1, segs: [{ utf8: '\n' }] },
    { tStartMs: 2000, dDurationMs: 3000, segs: [{ utf8: 'welcome' }, { utf8: ' back', tOffsetMs: 300 }] },
    { tStartMs: 7000, dDurationMs: 2000, segs: [{ utf8: 'today' }, { utf8: ' we', tOffsetMs: 200 }] },
  ],
});

const manualCaptions = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'This is the first' }] },
    { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: 'sentence.' }] },
    { tStartMs: 4000, dDurationMs: 2000, segs: [{ utf8: 'And a second\none!' }] },
  ],
});

test('parses auto captions word by word and skips newline events', () => {
  const tokens = L.parseTimedText(autoCaptions);
  assert.deepStrictEqual(tokens.map((t) => t.text), ['hello', ' everyone', ' and', 'welcome', ' back', 'today', ' we']);
  assert.strictEqual(tokens[1].t, 400);
  assert.ok(tokens[2].end - tokens[2].t <= 1500, 'word end is capped');
});

test('groups auto captions by pauses', () => {
  const cues = L.groupCues(L.parseTimedText(autoCaptions));
  assert.deepStrictEqual(cues.map((c) => c.text), ['hello everyone and welcome back', 'today we']);
  assert.strictEqual(cues[1].start, 7000);
});

test('groups manual captions into sentences across events', () => {
  const cues = L.groupCues(L.parseTimedText(manualCaptions));
  assert.deepStrictEqual(cues.map((c) => c.text), ['This is the first sentence.', 'And a second one!']);
  assert.deepStrictEqual([cues[0].start, cues[0].end], [0, 4000]);
});

test('splits very long unpunctuated runs', () => {
  const segs = Array.from({ length: 80 }, (_, i) => ({ utf8: ` word${i}`, tOffsetMs: i * 200 }));
  const cues = L.groupCues(L.parseJson3({ events: [{ tStartMs: 0, dDurationMs: 16000, segs }] }));
  assert.ok(cues.length > 1);
  assert.ok(cues.every((c) => c.text.length <= 170));
});

test('findCueIndex', () => {
  const cues = [{ start: 0 }, { start: 1000 }, { start: 5000 }];
  assert.strictEqual(L.findCueIndex(cues, -1), -1);
  assert.strictEqual(L.findCueIndex(cues, 999), 0);
  assert.strictEqual(L.findCueIndex(cues, 1000), 1);
  assert.strictEqual(L.findCueIndex(cues, 9000), 2);
});

test('newSuffix extracts only new words from rolling captions', () => {
  assert.strictEqual(L.newSuffix('', 'hello there'), 'hello there');
  assert.strictEqual(L.newSuffix('hello there', 'hello there my friend'), 'my friend');
  assert.strictEqual(L.newSuffix('a b c d', 'c d e f'), 'e f');
  assert.strictEqual(L.newSuffix('a b c', 'b c'), '');
  assert.strictEqual(L.newSuffix('old line', 'brand new'), 'brand new');
});

test('fitRate speeds up only when needed', () => {
  assert.strictEqual(L.fitRate('short', 5000, 1.1), 1.1);
  const r = L.fitRate('x'.repeat(140), 5000, 1);
  assert.ok(r > 1.9 && r <= 2);
});

test('videoIdFromUrl', () => {
  assert.strictEqual(L.videoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), 'dQw4w9WgXcQ');
  assert.strictEqual(L.videoIdFromUrl('https://www.youtube.com/live/abcDEF12345'), 'abcDEF12345');
  assert.strictEqual(L.videoIdFromUrl('https://www.youtube.com/'), null);
});
