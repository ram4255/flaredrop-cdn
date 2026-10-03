import JSZip from 'jszip';
import { RepoFile } from '../types';

/**
 * Creates a downloadable .zip archive from the generated repository files
 */
export async function downloadRepoZip(files: RepoFile[], zipFilename: string = 'flaredrop-cloudflare-cdn.zip'): Promise<void> {
  const zip = new JSZip();

  files.forEach((file) => {
    zip.file(file.path, file.content);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = zipFilename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
