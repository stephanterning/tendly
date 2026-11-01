import { api, result } from '../accounts/api.js';
import { attachmentSchema } from '@tendly/shared';
export async function uploadFiles(householdId: string, taskId: string, files: File[]) {
  const policy = await result(
    api.GET('/api/v1/households/{householdId}/upload-policy', {
      params: { path: { householdId } },
    }),
  );
  const uploaded = [];
  for (const file of files) {
    if (file.size > policy.maxBytes) throw new Error('file_too_large');
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`/api/v1/households/${householdId}/tasks/${taskId}/attachments`, {
      method: 'POST',
      body,
    });
    const data: unknown = await response.json();
    if (!response.ok) throw new Error((data as { error?: string }).error ?? 'operation_failed');
    const item = attachmentSchema.parse(data);
    uploaded.push({
      src: `/api/v1/households/${householdId}/attachments/${item.id}/${item.preview ? 'preview' : 'download'}`,
      name: item.name,
      image: item.preview,
    });
  }
  return uploaded;
}
