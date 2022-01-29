const { TraceMap, sourceMapUrl } = window.node_modules;

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
window.addEventListener('DOMContentLoaded', () => {
  stack.addEventListener('change', update);
  stack.addEventListener('keyup', update);

  async function sourcemapUrlFromScript(scriptUrl) {
    try {
      const response = await fetch(scriptUrl);
      if (!response.ok) {
        throw new Error('failed to fetch script');
      }

      const { headers } = response;
      const header = headers.get('SourceMap') || headers.get('X-SourceMap');

      if (header) {
        return header;
      }

      const js = await response.text();
      const smUrl = sourceMapUrl.getFrom(js);
      if (!smUrl) {
        throw new Error('no sourcemap in the script');
      }

      const sourcemap = await fetch(new URL(smUrl, scriptUrl).href);
      if (!sourcemap || !sourcemap.ok) {
        throw new Error('failed to fetch sourcemap');
      }

      return new TraceMap(await sourcemap.text());
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  let value;
  async function update() {
    const trimmed = stack.value.trim();
    if (value == trimmed) {
      return;
    }
    value = trimmed;

    const sourceLocRe =
      /(?:(?<name>[$A-Z_][0-9A-Z_$]*)\s+\()?(?<source>\w+:\/\/[^\s]+\.js):(?<line>\d+):(?<column>\d+)\)?/gi;
    let match;

    const loads = { __proto__: null };
    while ((match = sourceLocRe.exec(value))) {
      const script = match[2];
      loads[script] ||= sourcemapUrlFromScript(script).then((sm) => [
        script,
        sm,
      ]);
    }

    const load = Promise.all(Object.values(loads));
    const sourcemaps = Object.fromEntries(await load);

    if (value != trimmed) return;

    const frames = [];
    for (const match of value.matchAll(sourceLocRe)) {
      const { length } = match[0];
      const { index, groups } = match;
      const { source, line, column } = groups;

      const tracer = sourcemaps[source];
      if (!tracer) {
        frames.push({ index, length, groups, original: undefined });
        continue;
      }

      const original = tracer.originalPositionFor({
        line: parseInt(line, 10),
        column: parseInt(column, 10) - 1,
      });
      frames.push({ index, length, groups, original });
    }

    let trace = '';
    let ptr = 0;
    for (let i = 0; i < frames.length; i++) {
      const { index, length, groups, original } = frames[i];

      trace += value.slice(ptr, index);
      ptr = index + length;

      // const next = i + 1 < frames.length ? frames[i + 1] : null;
      // const name = next?.original?.name || next?.groups.name;
      const name = original?.name || groups.name;

      if (name) trace += `${name} (`;
      trace += original?.source || groups.source;
      trace += ':';
      trace += original?.line || groups.line;
      trace += ':';
      trace += original?.column || groups.column;
      if (name) trace += ')';
    }

    original.value = trace;
  }
});
