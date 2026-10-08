"use strict";

// Recovery is a catalogue of tabs, not a request to start every old Shell.
// The selected tab is resumed through main's existing trusted spawn policy.
// Dormant records never claim to be a live PTY or lose another workspace's tab.
function createTerminalSessionCatalog({ store, manager }) {
  let dormant = null;
  function descriptors() {
    dormant ??= new Map(store.load().map((record) => [record.id, record]));
    return dormant;
  }
  function list() {
    const live = manager.listSessions();
    const liveIds = new Set(live.map((record) => record.id));
    return [
      ...[...descriptors().values()]
        .filter((record) => !liveIds.has(record.id))
        .map((record) => ({ ...record, backend: null, ptyPackage: null, output: "", outputSequence: 0 })),
      ...live,
    ];
  }
  return Object.freeze({
    list,
    get: (id) => descriptors().get(id),
    created: (record) => descriptors().delete(record.id),
    remove: (id) => descriptors().delete(id),
    persist: () => {
      const live = manager.listSessions();
      const liveIds = new Set(live.map((record) => record.id));
      return store.save([
        ...[...descriptors().values()].filter((record) => !liveIds.has(record.id)),
        ...live,
      ]);
    },
  });
}

module.exports = { createTerminalSessionCatalog };
