function isGitHubHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "github.com" || normalized.includes("github");
}

function trimGitSuffix(path: string): string {
  return path.replace(/\/+$/, "").replace(/\.git$/, "");
}

function normalizeRepoPath(path: string): string | null {
  const normalized = trimGitSuffix(path).replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  return segments.join("/");
}

function parseHttpRemote(url: string): { protocol: string; host: string; repoPath: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const repoPath = normalizeRepoPath(parsed.pathname);
    if (!repoPath) {
      return null;
    }

    return {
      protocol: parsed.protocol,
      host: parsed.host,
      repoPath,
    };
  } catch {
    return null;
  }
}

function parseScpLikeRemote(url: string): { host: string; repoPath: string } | null {
  const match = /^git@([^:]+):(.+)$/.exec(url.trim());
  if (!match) {
    return null;
  }

  const [, host, rawPath] = match;
  const repoPath = normalizeRepoPath(rawPath);
  if (!repoPath) {
    return null;
  }

  return { host, repoPath };
}

export function getGitHubRepoUrl(remoteUrl: string): string | null {
  const httpRemote = parseHttpRemote(remoteUrl);
  if (httpRemote) {
    if (!isGitHubHost(httpRemote.host)) {
      return null;
    }

    return `${httpRemote.protocol}//${httpRemote.host}/${httpRemote.repoPath}`;
  }

  const scpRemote = parseScpLikeRemote(remoteUrl);
  if (scpRemote) {
    if (!isGitHubHost(scpRemote.host)) {
      return null;
    }

    return `https://${scpRemote.host}/${scpRemote.repoPath}`;
  }

  return null;
}
