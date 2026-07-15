/** File Center types shared between API client and UI components. */

export interface FileFolder {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  visibility: "private" | "tenant";
  parent_id: string | null;
  display_name: string;
  path_cache: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FileObject {
  id: string;
  tenant_id: string;
  owner_user_id: string;
  visibility: "private" | "tenant";
  parent_folder_id: string | null;
  display_name: string;
  original_filename: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  checksum: string;
  description: string | null;
  storage_backend: string;
  object_key: string;
  source_type: "upload" | "ai_generated" | "business_attachment";
  business_type: string | null;
  business_id: string | null;
  created_by: string;
  created_by_role: string;
  created_at: string;
  updated_at: string;
}

export interface FileUploadResponse {
  success: boolean;
  file: FileObject;
  message: string;
}

export interface FolderCreateRequest {
  display_name: string;
  parent_id?: string | null;
  visibility?: "private" | "tenant";
}

export interface FileListParams {
  parent_folder_id?: string;
  source_type?: string;
  business_id?: string;
}

/** Human-readable file size. */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Get a display icon/emoji based on MIME type. */
export function getFileTypeIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip")) return "📦";
  if (mimeType.includes("json") || mimeType.includes("xml") || mimeType.includes("yaml")) return "📋";
  if (mimeType.includes("text/") || mimeType.includes("markdown")) return "📝";
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📽️";
  if (mimeType.includes("document") || mimeType.includes("word")) return "📃";
  return "📎";
}

/** Get a color class based on source type. */
export function getSourceTypeColor(sourceType: string): string {
  switch (sourceType) {
    case "upload":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "ai_generated":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    case "business_attachment":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    default:
      return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400";
  }
}

/** Get a human-readable label for source type. */
export function getSourceTypeLabel(sourceType: string): string {
  switch (sourceType) {
    case "upload":
      return "Uploaded";
    case "ai_generated":
      return "AI Generated";
    case "business_attachment":
      return "Business";
    default:
      return sourceType;
  }
}
