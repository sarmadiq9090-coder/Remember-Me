// The attachment list inside the task and note editors.
function renderEditorFiles(type) {
  const ids = type === 'task' ? taskAttachments : noteAttachments;
  // After a remove, focus goes to the next file's remove button, or to Add files.
  replaceMarkup($(type + '-files'), ids.map(id => state.attachments.find(a => a.id === id)).filter(Boolean).map(a => fileMarkup(a, true)).join(''), $(type + '-attach'));
  $(type + '-file-count').textContent = `${ids.length} / 20`;
  hydratePreviews($(type + '-files'));
}
