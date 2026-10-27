import "../instrument.server.mjs";

// Sentry instruments `pg` as it loads, so the app (which pulls in `pg`) is
// imported only once `Sentry.init` has run. A static import would load it first.
const { default: serverEntry } = await import("./server-app");

export default serverEntry;
