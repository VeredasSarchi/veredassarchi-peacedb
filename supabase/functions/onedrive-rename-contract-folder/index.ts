import {
  findFolderByName,
  getAccessToken,
  getRequiredEnv,
  renameDriveItem,
  resolveCategoryPath,
  type OneDriveCategoryType,
} from "../_shared/onedrive.ts";

const CANCELLED_SUFFIX = " - ANULADO";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RenameContractFolderPayload = {
  categoryName?: string;
  categoryType?: OneDriveCategoryType;
  folderName?: string;
};

function getCancelledFolderName(folderName: string) {
  return folderName.trim().endsWith(CANCELLED_SUFFIX)
    ? folderName.trim()
    : `${folderName.trim()}${CANCELLED_SUFFIX}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo no permitido" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  try {
    const payload = (await request.json()) as RenameContractFolderPayload;
    const categoryName = payload.categoryName?.trim();
    const categoryType = payload.categoryType ?? "garden";
    const folderName = payload.folderName?.trim();

    if (!categoryName || !folderName) {
      return new Response(JSON.stringify({ error: "categoryName y folderName son obligatorios" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const targetName = getCancelledFolderName(folderName);
    const basePath = getRequiredEnv("ONEDRIVE_BASE_PATH");
    const accessToken = await getAccessToken();
    const category = await resolveCategoryPath(accessToken, basePath, categoryName, categoryType);

    const contractFolder = await findFolderByName(accessToken, category.path, folderName);
    const alreadyCancelledFolder = await findFolderByName(accessToken, category.path, targetName);

    if (contractFolder?.id && alreadyCancelledFolder?.id && contractFolder.id !== alreadyCancelledFolder.id) {
      return new Response(
        JSON.stringify({
          error: `Ya existe una carpeta llamada ${targetName} y tambien existe la carpeta original ${folderName}`,
        }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (alreadyCancelledFolder?.id) {
      return new Response(
        JSON.stringify({
          ok: true,
          status: "already_cancelled",
          categoryName,
          categoryType: category.type,
          categoryPath: category.path,
          previousName: alreadyCancelledFolder.name ?? targetName,
          newName: alreadyCancelledFolder.name ?? targetName,
          folder: {
            id: alreadyCancelledFolder.id,
            name: alreadyCancelledFolder.name ?? targetName,
            webUrl: alreadyCancelledFolder.webUrl ?? null,
          },
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (!contractFolder?.id) {
      return new Response(
        JSON.stringify({
          error: `No existe la carpeta ${folderName} dentro de ${category.path}`,
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const renamedFolder = await renameDriveItem(accessToken, contractFolder.id, targetName);

    return new Response(
      JSON.stringify({
        ok: true,
        status: "renamed",
        categoryName,
        categoryType: category.type,
        categoryPath: category.path,
        previousName: contractFolder.name ?? folderName,
        newName: renamedFolder.name ?? targetName,
        folder: {
          id: renamedFolder.id ?? contractFolder.id,
          name: renamedFolder.name ?? targetName,
          webUrl: renamedFolder.webUrl ?? null,
        },
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error renombrando carpeta de contrato en OneDrive:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "No se pudo renombrar la carpeta del contrato en OneDrive",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
