import { toPng } from 'html-to-image';
import { Capacitor } from '@capacitor/core';

async function native() {
  const [{ Share }, { Filesystem, Directory }] = await Promise.all([import('@capacitor/share'), import('@capacitor/filesystem')]);
  return { Share, Filesystem, Directory };
}

export async function nodeToPng(node) {
  return toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
}

// Shares a PNG data URL (WhatsApp/Telegram/etc). Falls back to download on desktop.
export async function shareImage(dataUrl, name, text = '') {
  if (Capacitor.isNativePlatform()) {
    const { Share, Filesystem, Directory } = await native();
    const r = await Filesystem.writeFile({ path: name, data: dataUrl.split(',')[1], directory: Directory.Cache });
    await Share.share({ title: name, text, files: [r.uri] });
    return 'shared';
  }
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], text });
    return 'shared';
  }
  download(dataUrl, name);
  return 'downloaded';
}

export async function shareFile(base64, name, mime, text = '') {
  if (Capacitor.isNativePlatform()) {
    const { Share, Filesystem, Directory } = await native();
    const r = await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache });
    await Share.share({ title: name, text, files: [r.uri] });
    return 'shared';
  }
  download(`data:${mime};base64,${base64}`, name);
  return 'downloaded';
}

export function download(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
