/** React Query hooks for File Center operations. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listFolders,
  createFolder,
  deleteFolder,
  listFiles,
  uploadFile,
  deleteFile,
  updateFileMetadata,
  downloadFileText,
} from "./api";
import type { FileFolder, FileObject, FileUploadResponse, FolderCreateRequest, FileListParams } from "./types";

// ── Folders ───────────────────────────────────────────────────────────────

export function useFolders(parentId?: string | null) {
  return useQuery({
    queryKey: ["files", "folders", parentId ?? "root"],
    queryFn: () => listFolders(parentId),
    staleTime: 30_000,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FolderCreateRequest) => createFolder(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", "folders"] });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string) => deleteFolder(folderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", "folders"] });
      void queryClient.invalidateQueries({ queryKey: ["files", "objects"] });
    },
  });
}

// ── Files ─────────────────────────────────────────────────────────────────

export function useFiles(params?: FileListParams) {
  return useQuery({
    queryKey: ["files", "objects", params?.parent_folder_id ?? "root", params?.source_type ?? "all"],
    queryFn: () => listFiles(params),
    staleTime: 30_000,
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      options,
    }: {
      file: File;
      options?: {
        parent_folder_id?: string;
        visibility?: "private" | "tenant";
        source_type?: string;
        description?: string;
      };
    }) => uploadFile(file, options),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", "objects"] });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => deleteFile(fileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", "objects"] });
    },
  });
}

export function useUpdateFileMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      fileId,
      updates,
    }: {
      fileId: string;
      updates: {
        display_name?: string;
        description?: string;
        parent_folder_id?: string | null;
        visibility?: "private" | "tenant";
      };
    }) => updateFileMetadata(fileId, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", "objects"] });
      void queryClient.invalidateQueries({ queryKey: ["files", "folders"] });
    },
  });
}

export function useFileText(fileId?: string) {
  return useQuery({
    queryKey: ["files", "text", fileId],
    queryFn: () => downloadFileText(fileId!),
    enabled: !!fileId,
    staleTime: 60_000,
  });
}
