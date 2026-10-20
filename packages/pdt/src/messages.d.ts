// This just suppresses LSP errors.
// It is here because paraglide clears src/paraglide when rebuilding messages.js
// There is currently no need to generate a full .d.ts, so the tsc overhead can be avoided
declare module '@i18n/messages.js';
