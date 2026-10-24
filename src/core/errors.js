'use strict';
const { format } = require('../../ui/lib/translate');
// An error shown to the user. The message is English; key and params let the main process
// translate it into the interface language when it is reported.
class UserError extends Error {
  constructor(key, params) { super(format(key, params)); this.key = key; this.params = params; }
}
module.exports = { UserError };
