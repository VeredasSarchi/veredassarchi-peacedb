import { getAccessToken, uploadFileToFolder } from "../_shared/onedrive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    const formData = await request.formData();
    const folderId = String(formData.get("folderId") ?? "").trim();
    const file = formData.get("file");

    if (!folderId) {
      return new Response(JSON.stringify({ error: "folderId es obligatorio" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Debes adjuntar un archivo valido" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const fileName = file.name.trim();
    if (!fileName) {
      return new Response(JSON.stringify({ error: "El archivo debe tener nombre" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const accessToken = await getAccessToken();
    const fileBuffer = new Uint8Array(await file.arrayBuffer());
    const uploaded = await uploadFileToFolder(
      accessToken,
      folderId,
      fileName,
      fileBuffer,
      file.type || "application/octet-stream",
    );

    return new Response(
      JSON.stringify({
        ok: true,
        item: {
          id: uploaded.id ?? null,
          name: uploaded.name ?? fileName,
          webUrl: uploaded.webUrl ?? null,
          size: uploaded.size ?? null,
          lastModifiedDateTime: uploaded.lastModifiedDateTime ?? null,
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
    console.error("Error subiendo archivo a OneDrive:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "No se pudo subir el archivo a OneDrive",
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
