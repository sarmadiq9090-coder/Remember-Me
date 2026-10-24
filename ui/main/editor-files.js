// The attachment list inside the task and note editors.
function renderEditorFiles(type) {
  const ids = type === 'task' ? taskAttachments : noteAttachments;
  $(type + '-files').innerHTML = ids.map(id => state.attachments.find(a => a.id === id)).filter(Boolean).map(a => fileMarkup(a, true)).join('');
  $(type + '-file-count').textContent = `${ids.length} / 20`;
  hydratePreviews($(type + '-files'));
}
