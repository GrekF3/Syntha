import { ApiError } from "@/lib/auth";

// Use same-origin by default and rely on Next.js rewrites.
// In Docker, set `API_ORIGIN` for the Next.js proxy to reach the backend.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authFetchJson<T = any>(url: string, opts: RequestInit = {}): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}), ...authHeaders() } as Record<string, string>;
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      const firstField = Object.keys(data)[0];
      const firstMsg = Array.isArray(data[firstField]) ? data[firstField][0] : data.detail;
      const msg = (typeof firstMsg === 'string' && firstMsg) || res.statusText || 'Ошибка запроса';
      throw new ApiError(msg, data, res.status);
    } catch {
      throw new ApiError(text || res.statusText, undefined, res.status);
    }
  }
  return res.json();
}

export type Chat = { id: number; uuid?: string; title: string; model: number; created_at: string; pinned?: boolean; last_text?: string|null; last_image_url?: string|null; last_created_at?: string|null; last_role?: 'me'|'model'|null; last_kind?: 'text'|'image'|null };
export type Message = { id: number; chat: number; author?: number|null; role: 'me'|'model'; kind: 'text'|'image'; text?: string; image_url?: string; created_at: string };
export type AiModel = { id: number; name: string; gender?: string; age?: number|null; bio?: string; fetishes?: string; avatar?: string; is_public?: boolean; created_by?: number };
export type ImageItem = { id: number; url: string; nsfw?: boolean; model?: number|null; created_at: string };
export type ImageJob = { id: number; prompt?: string; model?: number|null; status: 'queued'|'running'|'done'|'failed'; progress: number; result_url?: string; error?: string; created_at: string; updated_at?: string };

export async function listChats(): Promise<Chat[]> {
  return authFetchJson(`${API_BASE}/api/v1/chats/`);
}

export async function createChat(model: number, title?: string): Promise<Chat> {
  const body: any = { model };
  if (title) body.title = title;
  return authFetchJson(`${API_BASE}/api/v1/chats/`, { method: 'POST', body: JSON.stringify(body) });
}

export async function listMessages(chatId: number): Promise<Message[]> {
  return authFetchJson(`${API_BASE}/api/v1/messages/?chat=${encodeURIComponent(String(chatId))}`);
}

export async function sendMessage(chatId: number, text: string, role: 'me'|'model'='me'): Promise<Message> {
  return authFetchJson(`${API_BASE}/api/v1/messages/`, { method: 'POST', body: JSON.stringify({ chat: chatId, role, kind: 'text', text }) });
}

export async function getModel(modelId: number): Promise<AiModel> {
  return authFetchJson(`${API_BASE}/api/v1/models/${modelId}/`);
}

export async function getChat(idOrUuid: string | number): Promise<Chat> {
  return authFetchJson(`${API_BASE}/api/v1/chats/${idOrUuid}/`);
}

export async function renameChat(uuid: string, title: string): Promise<Chat> {
  return authFetchJson(`${API_BASE}/api/v1/chats/${uuid}/`, { method: 'PATCH', body: JSON.stringify({ title }) });
}

export async function togglePin(uuid: string, pinned: boolean): Promise<Chat> {
  return authFetchJson(`${API_BASE}/api/v1/chats/${uuid}/`, { method: 'PATCH', body: JSON.stringify({ pinned }) });
}

export async function deleteChat(uuid: string): Promise<void> {
  await authFetchJson(`${API_BASE}/api/v1/chats/${uuid}/`, { method: 'DELETE' });
}

export async function listModels(scope?: 'public'|'mine'): Promise<AiModel[]> {
  const url = scope ? `${API_BASE}/api/v1/models/?scope=${scope}` : `${API_BASE}/api/v1/models/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results || []);
}

export async function createModel(payload: Partial<AiModel> & { name: string; gender: string; age: number }): Promise<AiModel> {
  return authFetchJson(`${API_BASE}/api/v1/models/`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function listImagesByModel(modelId: number): Promise<ImageItem[]> {
  return authFetchJson(`${API_BASE}/api/v1/images/?model=${encodeURIComponent(String(modelId))}`);
}

export async function listImagesAll(): Promise<ImageItem[]> {
  const data = await authFetchJson(`${API_BASE}/api/v1/images/`);
  return Array.isArray(data) ? data : (data.results || []);
}

export async function generateImageStub(prompt?: string, modelId?: number, nsfw?: boolean) {
  return authFetchJson<{ id: number; url: string; nsfw?: boolean; created_at: string }>(`${API_BASE}/api/v1/images/generate/`, {
    method: 'POST',
    body: JSON.stringify({ prompt: prompt || '', model: modelId || null, nsfw: !!nsfw })
  });
}

export async function markImageNSFW(imageId: number | string) {
  return authFetchJson(`${API_BASE}/api/v1/images/${imageId}/mark_nsfw/`, { method: 'POST' });
}

export async function listImagesPaged(params?: { page?: number; page_size?: number; nsfw?: 'all'|'safe'|'nsfw'; q?: string; }): Promise<{ results: ImageItem[]; count: number; next?: string|null; previous?: string|null }>{
  const usp = new URLSearchParams();
  if (params?.page) usp.set('page', String(params.page));
  if (params?.page_size) usp.set('page_size', String(params.page_size));
  if (params?.q) usp.set('q', params.q);
  if (params?.nsfw && params.nsfw !== 'all') usp.set('nsfw', params.nsfw === 'nsfw' ? 'true' : 'false');
  const url = `${API_BASE}/api/v1/images/${usp.toString() ? `?${usp.toString()}` : ''}`;
  const data = await authFetchJson(url);
  if (Array.isArray(data)) {
    return { results: data, count: data.length };
  }
  return { results: data.results || [], count: data.count || 0, next: data.next || null, previous: data.previous || null };
}

// Image job APIs for async text2img
export async function createImageJob(prompt: string, modelId?: number|null, options?: { negative_prompt?: string; style?: 'real'|'anime'; nsfw?: boolean; init_image?: string; strength?: number; }): Promise<ImageJob> {
  const payload: any = { prompt, model: modelId ?? null };
  if (options?.negative_prompt) payload.negative_prompt = options.negative_prompt;
  if (options?.style) payload.style = options.style;
  if (typeof options?.nsfw === 'boolean') payload.nsfw = options.nsfw;
  if (options?.init_image) payload.init_image = options.init_image;
  if (typeof options?.strength === 'number') payload.strength = options.strength;
  return authFetchJson(`${API_BASE}/api/v1/image-jobs/`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getImageJob(id: number): Promise<ImageJob> {
  return authFetchJson(`${API_BASE}/api/v1/image-jobs/${id}/`);
}
