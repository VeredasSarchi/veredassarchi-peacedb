import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type GraphError = {
  error?: {
    code?: string;
    message?: string;
  };
};

type TokenConfigRow = {
  id: string;
  refresh_token: string;
};

export type OneDriveCategoryType = "garden" | "funeral_package" | "cremation";

export type DriveItem = {
  id?: string;
  name?: string;
  webUrl?: string;
  size?: number;
  folder?: Record<string, unknown> | null;
  file?: {
    mimeType?: string;
  } | null;
  parentReference?: {
    path?: string;
  } | null;
  lastModifiedDateTime?: string;
};

export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Falta configurar la variable ${name}`);
  }
  return value;
}

export function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}

export function buildItemPath(path: string): string {
  return normalizePath(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildChildrenByPathEndpoint(path: string, includeSelect = true): string {
  const encodedPath = buildItemPath(path);
  return `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/${
    includeSelect ? "children?$select=id,name,folder,file,webUrl,size,lastModifiedDateTime,parentReference" : "children"
  }`;
}

export async function parseGraphError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as GraphError;
    return body.error?.message || `Microsoft Graph respondio con estado ${response.status}`;
  } catch {
    return `Microsoft Graph respondio con estado ${response.status}`;
  }
}

export async function getAccessToken() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const tenantId = getRequiredEnv("ONEDRIVE_TENANT_ID");
  const authority = Deno.env.get("ONEDRIVE_AUTHORITY")?.trim() || tenantId;
  const clientId = getRequiredEnv("ONEDRIVE_CLIENT_ID");
  const clientSecret = getRequiredEnv("ONEDRIVE_CLIENT_SECRET");
  const fallbackRefreshToken = Deno.env.get("ONEDRIVE_REFRESH_TOKEN")?.trim();

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: tokenConfig, error: tokenConfigError } = await supabaseAdmin
    .from("onedrive_integration_config")
    .select("id, refresh_token")
    .eq("id", "primary")
    .maybeSingle();

  if (tokenConfigError) {
    throw new Error(`No se pudo leer la configuracion de OneDrive: ${tokenConfigError.message}`);
  }

  const refreshToken =
    ((tokenConfig as TokenConfigRow | null)?.refresh_token?.trim()) || fallbackRefreshToken;
  if (!refreshToken) {
    throw new Error("No existe un refresh_token configurado para OneDrive");
  }

  const tokenUrl = `https://login.microsoftonline.com/${authority}/oauth2/v2.0/token`;
  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "offline_access Files.ReadWrite User.Read",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`No se pudo renovar el token de OneDrive: ${details}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!data.access_token) {
    throw new Error("Microsoft no devolvio access_token para OneDrive");
  }

  const rotatedRefreshToken = data.refresh_token?.trim();
  if (rotatedRefreshToken && rotatedRefreshToken !== refreshToken) {
    const { error: upsertError } = await supabaseAdmin
      .from("onedrive_integration_config")
      .upsert(
        {
          id: "primary",
          refresh_token: rotatedRefreshToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    if (upsertError) {
      throw new Error(`No se pudo guardar el refresh_token rotado: ${upsertError.message}`);
    }
  } else if (!tokenConfig && fallbackRefreshToken) {
    const { error: seedError } = await supabaseAdmin
      .from("onedrive_integration_config")
      .upsert(
        {
          id: "primary",
          refresh_token: fallbackRefreshToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    if (seedError) {
      throw new Error(`No se pudo inicializar el refresh_token en base de datos: ${seedError.message}`);
    }
  }

  return data.access_token;
}

export async function listChildrenByPath(accessToken: string, path: string) {
  const response = await fetch(buildChildrenByPathEndpoint(path), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await parseGraphError(response));
  }

  const data = (await response.json()) as { value?: DriveItem[] };
  return data.value ?? [];
}

export async function listChildrenByItemId(accessToken: string, itemId: string) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}/children?$select=id,name,folder,file,webUrl,size,lastModifiedDateTime,parentReference`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(await parseGraphError(response));
  }

  const data = (await response.json()) as { value?: DriveItem[] };
  return data.value ?? [];
}

export async function findFolderByName(accessToken: string, parentPath: string, folderName: string) {
  const folders = await listChildrenByPath(accessToken, parentPath);
  return folders.find(
    (item) => item.folder && item.name?.trim().toLowerCase() === folderName.trim().toLowerCase(),
  );
}

async function resolveNestedCategoryPath(
  accessToken: string,
  basePath: string,
  rootFolderName: string,
  categoryName: string,
  categoryType: "funeral_package" | "cremation",
) {
  const rootFolder = await findFolderByName(accessToken, basePath, rootFolderName);
  if (!rootFolder) {
    throw new Error(`No existe la carpeta ${rootFolderName} dentro de OneDrive`);
  }

  const rootPath = `${normalizePath(basePath)}/${rootFolderName}`;
  const categoryFolder = await findFolderByName(accessToken, rootPath, categoryName);

  if (!categoryFolder) {
    throw new Error(`No existe la carpeta ${categoryName} dentro de ${rootFolderName} en OneDrive`);
  }

  return {
    path: `${rootPath}/${categoryName}`,
    item: categoryFolder,
    type: categoryType,
  };
}

export async function resolveCategoryPath(
  accessToken: string,
  basePath: string,
  categoryName: string,
  categoryType: OneDriveCategoryType,
) {
  if (categoryType === "funeral_package") {
    return resolveNestedCategoryPath(
      accessToken,
      basePath,
      "PAQUETES FUNERARIOS",
      categoryName,
      categoryType,
    );
  }

  if (categoryType === "cremation") {
    return resolveNestedCategoryPath(accessToken, basePath, "CREMACIONES", categoryName, categoryType);
  }

  const rootCategoryFolder = await findFolderByName(accessToken, basePath, categoryName);
  if (!rootCategoryFolder) {
    throw new Error(`No existe la carpeta del jardin ${categoryName} dentro de OneDrive`);
  }

  return {
    path: `${normalizePath(basePath)}/${categoryName}`,
    item: rootCategoryFolder,
    type: categoryType,
  };
}

export async function createFolderAtPath(accessToken: string, parentPath: string, folderName: string) {
  const response = await fetch(buildChildrenByPathEndpoint(parentPath, false), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    }),
  });

  if (!response.ok) {
    throw new Error(await parseGraphError(response));
  }

  return (await response.json()) as DriveItem;
}

export async function createFolderByItemId(accessToken: string, parentItemId: string, folderName: string) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentItemId)}/children`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await parseGraphError(response));
  }

  return (await response.json()) as DriveItem;
}

export async function uploadFileToFolder(
  accessToken: string,
  parentItemId: string,
  fileName: string,
  content: Uint8Array,
  contentType: string,
) {
  const encodedFileName = encodeURIComponent(fileName);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(parentItemId)}:/${encodedFileName}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: content,
    },
  );

  if (!response.ok) {
    throw new Error(await parseGraphError(response));
  }

  return (await response.json()) as DriveItem;
}
