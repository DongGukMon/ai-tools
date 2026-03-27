/** Sanitize input to valid git branch name characters. */
export function sanitizeBranchName(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9\-_./]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/\/{2,}/g, "/");
}
