import { api, result } from '../accounts/api.js';
import { attachmentSchema } from '@tendly/shared';
export type UploadedFile = { src: string; name: string; image: boolean; width?: number; height?: number };
export type FileUploader = (file: File, id: string, progress: (percent: number) => void) => Promise<UploadedFile>;
export async function uploadFile(householdId: string, taskId: string, file: File, id: string, progress: (percent: number) => void): Promise<UploadedFile> {
  const policy = await result(api.GET('/api/v1/households/{householdId}/upload-policy', {
    params: { path: { householdId } }, signal: AbortSignal.timeout(12_000),
  }));
  if (!file.size) throw new Error('empty_file');
  if (file.size > policy.maxBytes) throw new Error('file_too_large');
  const data = await new Promise<unknown>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/v1/households/${householdId}/tasks/${taskId}/attachments`);
    request.setRequestHeader('X-Upload-Id', id);
    request.timeout = 120_000;
    request.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    request.onerror = request.ontimeout = () => reject(new Error('upload_connection_lost'));
    request.onload = () => {
      try {
        const response = JSON.parse(request.responseText);
        if (request.status >= 200 && request.status < 300) resolve(response);
        else reject(new Error(response.error ?? 'operation_failed'));
      } catch { reject(new Error('upload_connection_lost')); }
    };
    const body = new FormData();
    body.append('file', file);
    request.send(body);
  });
  const item = attachmentSchema.parse(data);
  const src = `/api/v1/households/${householdId}/attachments/${item.id}/${item.preview ? 'preview' : 'download'}`;
  const dimensions = item.preview ? await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('upload_connection_lost')); }, 12_000);
    image.onload = () => { clearTimeout(timeout); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('upload_connection_lost')); };
    image.src = src;
  }) : {};
  return { src, name: item.name, image: item.preview, ...dimensions };
}
