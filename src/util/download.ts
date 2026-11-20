/**
 * Saves text as a file. On touch devices that can share files (iPhone/Android) it uses the
 * share sheet, which is the reliable way to get a file out of a home-screen web app;
 * elsewhere it downloads through a link.
 */
export async function saveTextFile(filename: string, text: string, mime = 'application/json'): Promise<void> {
  const file = new File([text], filename, { type: mime });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

  if (nav.maxTouchPoints > 0 && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // the user closed the sheet
      // anything else: fall through to a normal download
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari can cancel the download if the URL is revoked straight away.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
