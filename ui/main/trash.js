// Trash: moving items there, the confirm dialog and the list.
function askPurge(action, id) {
  pendingDelete = { action, id };
  $('confirm-title').textContent = action === 'emptyTrash' ? tr("Empty the trash?") : tr("Delete permanently?");
  $('confirm-text').textContent = action === 'emptyTrash' ? (tr("{count} items will be removed for good. This cannot be undone.", { count: trash.length })) : tr("This item will be removed from the trash for good. This cannot be undone.");
  $('confirm-dialog').showModal();
}
async function moveToTrash(kind, id) {
  try { await api('delete' + kind, { id }); await refresh(); toast(kind === 'Task' ? tr("Task moved to the trash.") : tr("Note moved to the trash."), () => api('restore' + kind, { id })); }
  catch (err) { toast(err.message); }
}
function renderTrash() {
  const items = trash.filter(({ item }) => matchesSearch(item, query));
  $('trash-count').textContent = num(items.length);
  $('empty-trash').hidden = !trash.length;
  $('trash-list').innerHTML = items.map(({ kind, item }) => {
    const left = Math.max(1, 30 - Math.floor((Date.now() - Date.parse(item.deletedAt)) / 86400000));
    const values = { date: dateLabel(item.deletedAt), count: left };
    const when = kind === 'Task' ? tr('Task • deleted {date} • removed in {count} days', values) : tr('Note • deleted {date} • removed in {count} days', values);
    return `<article class="task-row" data-kind="${kind}" data-id="${esc(item.id)}"><div class="task-info"><div class="task-name" dir="auto">${esc(item.title)}</div><div class="task-meta"><span>${icon('trash')}${esc(when)}</span></div></div><div class="task-actions"><button class="soft-button" data-trash="restore">${icon('undo')} ${tr("Restore")}</button><button class="icon-button" data-trash="purge" title="${tr("Delete permanently")}" aria-label="${tr("Delete permanently")} ${esc(item.title)}">${icon('x')}</button></div></article>`;
  }).join('');
  $('trash-empty').hidden = !!items.length;
}
