const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSearch, matchesSearch } = require('../ui/lib/search');

test('Arabic search ignores diacritics, tatweel, hamza forms, taa marbuta and alef maqsura', () => {
  const item = { title: 'مُراجَعة خطّة الأسبوع مع أحمد', body: 'الاتصـــال بالمستشفى، ومسؤول المبنى، والإنشاء' };
  for (const query of ['مراجعه', 'مراجعة', 'خطة', 'الاسبوع', 'احمد', 'إحمد', 'الاتصال', 'بالمستشفي', 'مسوول', 'الانشاء', 'أحمد الأسبوع']) assert.equal(matchesSearch(item, query), true, query);
  for (const query of ['اجتماع', 'أحمد غدا']) assert.equal(matchesSearch(item, query), false, query);
});

test('Latin search stays case-insensitive and an empty query matches everything', () => {
  assert.equal(matchesSearch({ title: 'Review the Weekly PLAN', body: '' }, 'weekly plan'), true);
  assert.equal(matchesSearch({ title: 'Ｆｕｌｌｗｉｄｔｈ', body: '' }, 'fullwidth'), true, 'Compatibility forms are folded');
  assert.equal(matchesSearch({ title: 'anything' }, '   '), true);
  assert.equal(normalizeSearch('  آية   ومرآة  '), 'ايه ومراه');
});

test('searching thousands of tasks stays fast enough for every keystroke', () => {
  const tasks = Array.from({ length: 5000 }, (_, i) => ({ title: `مهمّة رقم ${i}`, body: 'تفاصيلُ إضافيّة للمهمة '.repeat(5) }));
  tasks.filter(t => matchesSearch(t, 'مهمه'));
  const started = performance.now();
  for (const query of ['م', 'مه', 'مهم', 'مهمه', 'مهمه رقم 4999']) tasks.filter(t => matchesSearch(t, query));
  assert.ok(performance.now() - started < 250);
  assert.equal(tasks.filter(t => matchesSearch(t, 'مهمه رقم 4999')).length, 1);
});
