/**
 * REDIRECTOR: This file is kept for compatibility with old deployment settings.
 * It immediately hands over control to the new unified server.js.
 */
console.log('[REDIRECT] Forwarding to server.js...');
require('./server.js');
