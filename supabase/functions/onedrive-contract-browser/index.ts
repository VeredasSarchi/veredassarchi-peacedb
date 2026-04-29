import {
  findFolderByName,
  getAccessToken,
  getRequiredEnv,
  listChildrenByItemId,
  resolveCategoryPath,
  type OneDriveCategoryType,
} from "../_shared/onedrive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InspectContractPayload = {
  action: "inspect_contract";
  categoryName?: string;
  categoryType?: OneDriveCategoryType;
  folderName?: string;
};

type ListChildrenPayload = {
  action: "list_folder_children";
  folderId?: string;
};

type BrowserPayload = InspectContractPayload | ListChildrenPayload;

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
    const payload = (await request.json()) as BrowserPayload;
    const accessToken = await getAccessToken();

    if (payload.action === "list_folder_children") {
      const folderId = payload.folderId?.trim();
      if (!folderId) {
        return new Response(JSON.stringify({ error: "folderId es obligatorio" }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      const children = await listChildrenByItemId(accessToken, folderId);
      return new Response(
        JSON.stringify({
          ok: true,
          items: children.map((item) => ({
            id: item.id ?? null,
            name: item.name ?? null,
            webUrl: item.webUrl ?? null,
            isFolder: Boolean(item.folder),
            mimeType: item.file?.mimeType ?? null,
            size: item.size ?? null,
            lastModifiedDateTime: item.lastModifiedDateTime ?? null,
          })),
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const categoryName = payload.categoryName?.trim();
    const folderName = payload.folderName?.trim();
    const categoryType = payload.categoryType ?? "garden";

    if (!categoryName || !folderName) {
      return new Response(JSON.stringify({ error: "categoryName y folderName son obligatorios" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const basePath = getRequiredEnv("ONEDRIVE_BASE_PATH");
    const category = await resolveCategoryPath(accessToken, basePath, categoryName, categoryType);
    const contractFolder = await findFolderByName(accessToken, category.path, folderName);

    if (!contractFolder?.id) {
      return new Response(
        JSON.stringify({
          ok: true,
          exists: false,
          categoryName,
          categoryType,
          categoryPath: category.path,
          folderName,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const children = await listChildrenByItemId(accessToken, contractFolder.id);

    return new Response(
      JSON.stringify({
        ok: true,
        exists: true,
        categoryName,
        categoryType,
        categoryPath: category.path,
        folder: {
          id: contractFolder.id,
          name: contractFolder.name ?? folderName,
          webUrl: contractFolder.webUrl ?? null,
        },
        items: children.map((item) => ({
          id: item.id ?? null,
          name: item.name ?? null,
          webUrl: item.webUrl ?? null,
          isFolder: Boolean(item.folder),
          mimeType: item.file?.mimeType ?? null,
          size: item.size ?? null,
          lastModifiedDateTime: item.lastModifiedDateTime ?? null,
        })),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error explorando OneDrive:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "No se pudo explorar OneDrive",
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
