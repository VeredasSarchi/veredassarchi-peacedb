import {
  createFolderAtPath,
  createFolderByItemId,
  getAccessToken,
  getRequiredEnv,
  resolveCategoryPath,
} from "../_shared/onedrive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CreateFolderPayload = {
  clientName?: string;
  categoryName?: string;
  categoryType?: "garden" | "funeral_package" | "cremation";
  folderName?: string;
};

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
    const { clientName, categoryName, categoryType, folderName } = (await request.json()) as CreateFolderPayload;
    const normalizedClientName = clientName?.trim();
    const normalizedCategoryName = categoryName?.trim();
    const normalizedCategoryType = categoryType ?? "garden";
    const normalizedFolderName = folderName?.trim();

    if (!normalizedClientName || !normalizedCategoryName || !normalizedFolderName) {
      return new Response(
        JSON.stringify({
          error: "Debes enviar clientName, categoryName y folderName",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const basePath = getRequiredEnv("ONEDRIVE_BASE_PATH");
    const accessToken = await getAccessToken();

    const category = await resolveCategoryPath(
      accessToken,
      basePath,
      normalizedCategoryName,
      normalizedCategoryType,
    );
    const createdFolder = await createFolderAtPath(accessToken, category.path, normalizedFolderName);

    if (!createdFolder.id) {
      throw new Error("Microsoft Graph no devolvio el id de la carpeta principal creada");
    }

    // Creamos las dos subcarpetas operativas dentro de la carpeta principal.
    const [comprobantesFolder, facturasFolder] = await Promise.all([
      createFolderByItemId(accessToken, createdFolder.id, "COMPROBANTES"),
      createFolderByItemId(accessToken, createdFolder.id, "FACTURAS"),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        status: "created",
        clientName: normalizedClientName,
        categoryName: normalizedCategoryName,
        categoryType: category.type,
        folderName: createdFolder.name ?? normalizedFolderName,
        folderId: createdFolder.id,
        webUrl: createdFolder.webUrl ?? null,
        subfolders: [
          comprobantesFolder.name ?? "COMPROBANTES",
          facturasFolder.name ?? "FACTURAS",
        ],
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error creando estructura del cliente en OneDrive:", error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la estructura de carpetas en OneDrive",
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
