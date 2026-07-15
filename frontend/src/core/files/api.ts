/** File Center API client — communicates with the backend /api/files endpoints. */

import { getAuthHeaders } from "@/core/api/auth-client";
import { getBackendBaseURL } from "@/core/config";

import type {
  FileFolder,
  FileObject,
  FileUploadResponse,
  FolderCreateRequest,
  FileListParams,
} from "./types";

const BASE = () => `${getBackendBaseURL()}/api/files`;

// ── Folder APIs ──────────────────────────────────────────────────────────

export async function listFolders(parentId?: string | null): Promise<FileFolder[]> {
  const params = new URLSearchParams();
  if (parentId !== undefined && parentId !== null) {
    params.set("parent_id", parentId);
  }
  const url = `${BASE()}/folders${params.toString() ? "?" + params.toString() : ""}`;
  const res = await fetch(url, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(`Failed to list folders: ${res.status}`);
  return res.json();
}

export async function createFolder(input: FolderCreateRequest): Promise<FileFolder> {
  const res = await fetch(`${BASE()}/folders`, {
    method: "POST",
    headers: await getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail ?? `Failed to create folder: ${res.status}`);
  }
  return res.json();
}

export async function deleteFolder(folderId: string): Promise<void> {
  const res = await fetch(`${BASE()}/folders/${folderId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail ?? `Failed to delete folder: ${res.status}`);
  }
}

// ── File APIs ─────────────────────────────────────────────────────────────

export async function listFiles(params?: FileListParams): Promise<FileObject[]> {
  const searchParams = new URLSearchParams();
  if (params?.parent_folder_id) searchParams.set("parent_folder_id", params.parent_folder_id);
  if (params?.source_type) searchParams.set("source_type", params.source_type);
  if (params?.business_id) searchParams.set("business_id", params.business_id);
  const qs = searchParams.toString();
  const url = `${BASE()}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(`Failed to list files: ${res.status}`);
  return res.json();
}

export async function uploadFile(
  file: File,
  options?: {
    parent_folder_id?: string;
    visibility?: "private" | "tenant";
    source_type?: string;
    description?: string;
  },
): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  if (options?.parent_folder_id) params.set("parent_folder_id", options.parent_folder_id);
  if (options?.visibility) params.set("visibility", options.visibility);
  if (options?.source_type) params.set("source_type", options.source_type);
  if (options?.description) params.set("description", options.description);
  const qs = params.toString();

  const url = `${BASE()}/upload${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: formData,
  });
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error("File exceeds maximum size of 50 MB");
    }
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail ?? `Failed to upload file: ${res.status}`);
  }
  return res.json();
}

export function getDownloadUrl(fileId: string): string {
  return `${BASE()}/${fileId}/download`;
}

export function getPreviewUrl(fileId: string): string {
  return `${BASE()}/${fileId}/preview`;
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await fetch(`${BASE()}/${fileId}`, {
    method: "DELETE",
    headers: await getAuthHeaders(),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail ?? `Failed to delete file: ${res.status}`);
  }
}

export async function updateFileMetadata(
  fileId: string,
  updates: {
    display_name?: string;
    description?: string;
    parent_folder_id?: string | null;
    visibility?: "private" | "tenant";
  },
): Promise<FileObject> {
  const params = new URLSearchParams();
  if (updates.display_name !== undefined) params.set("display_name", updates.display_name);
  if (updates.description !== undefined) params.set("description", updates.description);
  if (updates.parent_folder_id !== undefined) params.set("parent_folder_id", updates.parent_folder_id ?? "");
  if (updates.visibility !== undefined) params.set("visibility", updates.visibility);
  const qs = params.toString();

  const res = await fetch(`${BASE()}/${fileId}${qs ? "?" + qs : ""}`, {
    method: "PATCH",
    headers: await getAuthHeaders(),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail ?? `Failed to update file: ${res.status}`);
  }
  return res.json();
}

export async function downloadFileText(fileId: string): Promise<string> {
  const res = await fetch(`${BASE()}/${fileId}/download`, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  return res.text();
}
