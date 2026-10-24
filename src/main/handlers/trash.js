'use strict';
const { trashItem, restoreItem, purgeItem, purgeTrash } = require('../../core/tasks');

module.exports = ctx => {
  const change = fn => ({ run: payload => { ctx.store.change(s => fn(s, payload)); } });
  return {
    deleteTask: change((s, { id }) => trashItem(s, 'tasks', id)),
    restoreTask: change((s, { id }) => restoreItem(s, 'tasks', id)),
    purgeTask: change((s, { id }) => purgeItem(s, 'tasks', id)),
    deleteNote: change((s, { id }) => trashItem(s, 'notes', id)),
    restoreNote: change((s, { id }) => restoreItem(s, 'notes', id)),
    purgeNote: change((s, { id }) => purgeItem(s, 'notes', id)),
    emptyTrash: change(s => purgeTrash(s, new Date(), true)),
  };
};
