declare const __JTT_VERSION__: string | undefined;

function getVersion(): string {
  // In compiled binaries, __JTT_VERSION__ is injected via --define at build time.
  // In development (bun run dev), we fall back to reading package.json directly.
  if (typeof __JTT_VERSION__ !== 'undefined') {
    return __JTT_VERSION__;
  }

  try {
    // Dynamic import path so it doesn't get bundled into compiled binaries
    const packageJsonPath = new URL('../package.json', import.meta.url).pathname;
    const packageJson = JSON.parse(require('node:fs').readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return 'unknown';
  }
}

export const VERSION = getVersion();
