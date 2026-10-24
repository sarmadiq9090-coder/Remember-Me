'use strict';
const { randomUUID } = require('node:crypto');
const { noteLook } = require('../../core/tasks');
const { attachmentIds } = require('../../data/attachments');

module.exports = ctx => ({
  saveNote: { run: payload => {
    ctx.store.change(s => {
      const title = String(payload.title || '').trim();
      if (!title || title.length > 200) throw new Error(ctx.tr('Add a note title of up to 200 characters.'));
      let note = s.notes.find(n => n.id === payload.id);
      if (!note) { note = { id: randomUUID(), createdAt: new Date().toISOString() }; s.notes.push(note); }
      Object.assign(note, { title, body: String(payload.body || '').slice(0, 50000), attachments: attachmentIds(payload.attachments ?? note.attachments ?? []), ...noteLook(payload), updatedAt: new Date().toISOString() });
    });
  } },
});
