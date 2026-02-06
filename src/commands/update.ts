import { basename, join } from 'node:path';
import { chmod, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { VERSION } from '../index.js';

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubReleaseAsset[];
}

const REPO = 'nicholascostadev/jira-time-tracker';

function getPlatformAssetName(tag: string): string {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return `jtt-${tag}-macos-arm64.tar.gz`;
  }

  if (process.platform === 'linux' && process.arch === 'x64') {
    return `jtt-${tag}-linux-x64.tar.gz`;
  }

  throw new Error(
    `Auto-update is not supported on ${process.platform}-${process.arch} yet. Download manually from https://github.com/${REPO}/releases`,
  );
}

function getTargetBinaryPath(): string {
  const currentExecutable = process.execPath;
  const executableName = basename(currentExecutable);

  if (!executableName.startsWith('jtt')) {
    throw new Error(
      'Auto-update only works when running the installed jtt binary. Run `jtt update` instead of `bun run dev update`.',
    );
  }

  return currentExecutable;
}

export async function updateCommand(): Promise<void> {
  console.log('Checking latest release...');

  const releaseResponse = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!releaseResponse.ok) {
    throw new Error(`Failed to fetch latest release (${releaseResponse.status})`);
  }

  const release = (await releaseResponse.json()) as GitHubRelease;
  const latestVersion = release.tag_name.replace(/^v/, '');

  if (latestVersion === VERSION) {
    console.log(`jtt is already up to date (v${VERSION}).`);
    return;
  }

  const assetName = getPlatformAssetName(release.tag_name);
  const asset = release.assets.find((candidate) => candidate.name === assetName);

  if (!asset) {
    throw new Error(`Release asset not found: ${assetName}`);
  }

  const targetBinary = getTargetBinaryPath();
  const tempDirectory = await mkdtemp(join(tmpdir(), 'jtt-update-'));
  const archivePath = join(tempDirectory, asset.name);
  const extractedBinaryPath = join(tempDirectory, 'jtt');

  try {
    console.log(`Updating jtt from v${VERSION} to ${release.tag_name}...`);
    console.log(`Downloading ${asset.name}...`);
    const assetResponse = await fetch(asset.browser_download_url);

    if (!assetResponse.ok || !assetResponse.body) {
      throw new Error(`Failed to download release asset (${assetResponse.status})`);
    }

    await Bun.write(archivePath, assetResponse);

    const extractionResult = Bun.spawnSync(['tar', '-xzf', archivePath, '-C', tempDirectory], {
      stdout: 'inherit',
      stderr: 'inherit',
    });

    if (extractionResult.exitCode !== 0) {
      throw new Error('Failed to extract release archive');
    }

    await chmod(extractedBinaryPath, 0o755);
    await copyFile(extractedBinaryPath, targetBinary);

    console.log(`Updated jtt to ${release.tag_name}`);
    console.log('Your local Jira config and API token were preserved.');
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
