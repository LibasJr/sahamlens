import { invoke } from '@tauri-apps/api/core';

export async function saveBinaryExport(filename: string, dataUrl: string): Promise<boolean> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const response = await fetch(dataUrl);
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
    return invoke<boolean>('native_save_binary_export', { filename, bytes });
  }

  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
  return true;
}
