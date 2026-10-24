'use strict';
// Where the sticky alert goes on a display: next to the taskbar, at the side the user chose.
// Works in DIPs, as Electron's screen API does, so DPI scaling needs no special handling.
const MARGIN = 16, GAP = 12;
function taskbarEdge({ bounds, workArea }) {
  if (workArea.y > bounds.y) return 'top';
  if (workArea.y + workArea.height < bounds.y + bounds.height) return 'bottom';
  if (workArea.x > bounds.x) return 'left';
  if (workArea.x + workArea.width < bounds.x + bounds.width) return 'right';
  return 'bottom'; // auto-hidden taskbar: behave as the default bottom taskbar
}
function alertBounds(display, side = 'right', size = { width: 410, height: 570 }) {
  const area = display.workArea, edge = taskbarEdge(display);
  const width = Math.max(1, Math.min(size.width, area.width - 2 * GAP)), height = Math.max(1, Math.min(size.height, area.height - 2 * GAP));
  const x = side === 'left' ? area.x + MARGIN : area.x + area.width - width - MARGIN;
  const y = edge === 'top' ? area.y + GAP : area.y + area.height - height - GAP;
  return { x: Math.round(Math.max(area.x, x)), y: Math.round(Math.max(area.y, y)), width: Math.round(width), height: Math.round(height) };
}
module.exports = { taskbarEdge, alertBounds };
