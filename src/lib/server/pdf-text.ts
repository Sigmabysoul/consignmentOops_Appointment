import { execFile } from "node:child_process";

/**
 * PDF → text with poppler's `pdftotext -layout` (same tool the main app uses; the Docker image
 * installs poppler-utils). Resolves null when the tool is missing or the PDF has no text layer
 * (e.g. a scanned image), so callers can fall back to asking the operator.
 */
export function pdfToLayoutText(buffer: Buffer): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile(
      "pdftotext",
      ["-layout", "-", "-"],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 20_000 },
      (err, stdout) => resolve(err || !stdout.trim() ? null : stdout)
    );
    child.stdin?.on("error", () => resolve(null));
    child.stdin?.end(buffer);
  });
}
