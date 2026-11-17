'use strict';
// Root entry point for the compiled package (see package.json "main").
// n8n loads the nodes via the "n8n.nodes" key; this file only re-exports
// the compiled classes for programmatic consumers.
module.exports = require('./dist/index.js');
