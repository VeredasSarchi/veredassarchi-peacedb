import { supabase } from "@/integrations/supabase/client";
import type { OneDriveFolderPayload } from "@/lib/contract-onedrive";

export type RenameContractFolderResponse = {
  ok: boolean;
  status: "renamed" | "already_cancelled";
  categoryName: string;
  categoryType: OneDriveFolderPayload["categoryType"];
  categoryPath: string;
  previousName: string;
  newName: string;
  folder: {
    id: string;
    name: string;
    webUrl: string | null;
  };
};

async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response =
    typeof error === "object" && error && "context" in error
      ? (error as { context?: Response }).context
      : undefined;

  if (!response) {
    return fallback;
  }

  try {
    const body = (await response.clone().json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export async function renameContractFolderAsCancelled(
  payload: OneDriveFolderPayload,
): Promise<RenameContractFolderResponse> {
  const { data, error } = await supabase.functions.invoke<RenameContractFolderResponse>(
    "onedrive-rename-contract-folder",
    {
      body: {
        categoryName: payload.categoryName,
        categoryType: payload.categoryType,
        folderName: payload.folderName,
      },
    },
  );

  if (error) {
    throw new Error(
      await getFunctionErrorMessage(error, "No se pudo renombrar la carpeta del contrato en OneDrive"),
    );
  }

  if (!data?.ok) {
    throw new Error("OneDrive no devolvio una respuesta valida al renombrar la carpeta");
  }

  return data;
}
