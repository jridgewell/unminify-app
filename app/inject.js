const { contextBridge } = require('electron');
const { TraceMap } = require('@jridgewell/trace-mapping');
const sourceMapUrl = require('source-map-url');

contextBridge.exposeInMainWorld('node_modules', {
  TraceMap: function (map) {
    const tracer = new TraceMap(map);
    return {
      originalPositionFor() {
        return tracer.originalPositionFor(...arguments);
      },
    };
  },
  sourceMapUrl,
});
