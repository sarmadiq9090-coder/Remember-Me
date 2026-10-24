const { test } = require('node:test');
const assert = require('node:assert/strict');
const { taskbarEdge, alertBounds } = require('../src/core/placement');
const display = (bounds, workArea) => ({ bounds, workArea });
const full = { x: 0, y: 0, width: 1920, height: 1080 };

test('the alert sits beside the taskbar wherever it is docked, on the chosen side', () => {
  const bottom = display(full, { x: 0, y: 0, width: 1920, height: 1032 });
  assert.equal(taskbarEdge(bottom), 'bottom');
  assert.deepEqual(alertBounds(bottom, 'right'), { x: 1494, y: 450, width: 410, height: 570 }, 'Same place as before for the usual taskbar');
  assert.deepEqual(alertBounds(bottom, 'left'), { x: 16, y: 450, width: 410, height: 570 });
  const top = display(full, { x: 0, y: 48, width: 1920, height: 1032 });
  assert.equal(taskbarEdge(top), 'top');
  assert.equal(alertBounds(top, 'right').y, 60, 'Just under a top taskbar');
  const left = display(full, { x: 62, y: 0, width: 1858, height: 1080 });
  assert.equal(taskbarEdge(left), 'left');
  assert.equal(alertBounds(left, 'left').x, 78, 'Never under a left taskbar');
  assert.equal(taskbarEdge(display(full, { x: 0, y: 0, width: 1858, height: 1080 })), 'right');
  assert.equal(taskbarEdge(display(full, full)), 'bottom', 'Auto-hidden taskbar');
});

test('secondary displays, negative coordinates, scaling and small screens stay inside the work area', () => {
  const secondary = display({ x: -1280, y: -200, width: 1280, height: 1024 }, { x: -1280, y: -200, width: 1280, height: 984 });
  const b = alertBounds(secondary, 'right');
  assert.ok(b.x >= -1280 && b.x + b.width <= 0 && b.y >= -200 && b.y + b.height <= 784);
  const scaled = display({ x: 0, y: 0, width: 1280, height: 720 }, { x: 0, y: 0, width: 1280, height: 672 });  // 1920x1080 at 150%
  assert.deepEqual(alertBounds(scaled, 'right'), { x: 854, y: 90, width: 410, height: 570 });
  const tiny = display({ x: 0, y: 0, width: 400, height: 500 }, { x: 0, y: 0, width: 400, height: 460 });
  const t = alertBounds(tiny, 'right');
  assert.ok(t.width <= 376 && t.height <= 436 && t.x >= 0 && t.y >= 0, JSON.stringify(t));
});
