// Task rows and note cards.
function attachmentChips(ids = []) {
  const records = ids.map(id => state.attachments.find(a => a.id === id)).filter(Boolean);
  return records.filter(isImageFile).map(photoMarkup).join('') + records.filter(a => !isImageFile(a)).map(a => `<button type="button" class="file-chip" data-file-id="${esc(a.id)}" title="${tr('Open')} ${esc(a.name)}">${icon('paperclip')}<bdi>${esc(a.name)}</bdi></button>`).join('');
}
function taskCard(t) {
  const overdue = t.dueAt && Date.parse(t.dueAt) <= Date.now() && !t.completedAt;
  const due = t.dueAt ? `<span class="${overdue ? 'overdue' : ''}">${icon('clock')}${esc(dateLabel(t.dueAt))}${overdue ? ` • ${tr("Due now")}` : ''}</span>` : `<span>${tr("No due date")}</span>`;
  return `<article class="task-row ${t.completedAt ? 'completed' : ''}" data-id="${esc(t.id)}">
    <button class="task-check" data-action="${t.completedAt ? 'reopen' : 'complete'}" aria-label="${t.completedAt ? tr("Reopen") : tr("Complete")} ${esc(t.title)}" title="${t.completedAt ? tr("Reopen without due date") : tr("Mark complete")}">${t.completedAt ? icon('check') : ''}</button>
    <div class="task-info"><div ${!t.completedAt ? 'data-action="edit" tabindex="0" role="button" class="task-edit-target"' : ''}><div class="task-name" dir="auto">${esc(t.title)}</div>${t.body ? `<p class="task-body" dir="auto">${esc(t.body)}</p>` : ''}<div class="task-meta">${due}${t.repeat !== 'none' ? `<span>${icon('repeat')}${esc(repeatLabel(t, state.settings.weekStart))}</span>` : ''}${(t.tags || []).map(tag => `<span class="tag-chip"><bdi>#${esc(tag)}</bdi></span>`).join('')}${t.remindBefore && !t.completedAt ? `<span title="${tr("Early notice")}">${icon('bell')}${esc($('task-before').querySelector(`option[value="${t.remindBefore}"]`)?.textContent || '')}</span>` : ''}${t.snoozedAt && !t.completedAt ? `<span>${tr("Snoozed")}</span>` : ''}</div></div>${stepsMarkup(t)}${t.attachments?.length ? `<div class="file-chips">${attachmentChips(t.attachments)}</div>` : ''}</div>
    ${t.priority !== 'normal' ? `<span class="priority ${t.priority}">${t.priority === 'high' ? tr("High priority") : tr("Medium")}</span>` : ''}<div class="task-actions">${!t.completedAt && t.repeat !== 'none' ? `<button class="icon-button" data-action="skip" title="${tr("Skip this time")}" aria-label="${tr("Skip this time")}: ${esc(t.title)}">${icon('skip')}</button>` : ''}${!t.completedAt ? `<button class="icon-button" data-action="edit" title="${tr("Edit task")}" aria-label="${tr("Edit task")}: ${esc(t.title)}">${icon('edit')}</button>` : ''}<button class="icon-button" data-action="delete" title="${tr("Delete task")}" aria-label="${tr("Delete task")}: ${esc(t.title)}">${icon('trash')}</button></div></article>`;
}
function renderNotes() {
  const notes = state.notes.filter(n => matchesSearch(n, query)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  setMarkup($('notes-list'), notes.map(n => `<article class="note-card paper" data-paper="${esc(n.color)}" data-note-style="${esc(n.style || 'plain')}" data-id="${esc(n.id)}"><div class="note-edit-target" tabindex="0" role="button" aria-label="${tr('Edit')} ${esc(n.title)}"><h3 dir="auto">${esc(n.title)}</h3><p dir="auto">${esc(n.body)}</p></div>${n.attachments?.length ? `<div class="file-chips">${attachmentChips(n.attachments)}</div>` : ''}<footer><span>${new Date(n.updatedAt).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}</span><button class="icon-button" data-action="delete" aria-label="${tr('Delete note')}: ${esc(n.title)}">${icon('trash')}</button></footer></article>`).join(''), $('page-title'));
  $('notes-empty').hidden = !!notes.length;
  $('notes-empty').querySelector('h3').textContent = query ? tr("No matching notes") : tr("Your ideas deserve a place");
}
