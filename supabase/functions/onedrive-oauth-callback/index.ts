import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CallbackPayload = {
  code?: string;
};

type GraphMeResponse = {
  displayName?: string;
  userPrincipalName?: string;
  mail?: string;
};

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Falta configurar la variable ${name}`);
  }
  return value;
}

async function getGraphProfile(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return {
      accountDisplayName: null,
      accountEmail: null,
    };
  }

  const data = (await response.json()) as GraphMeResponse;
  return {
    accountDisplayName: data.displayName ?? null,
    accountEmail: data.mail ?? data.userPrincipalName ?? null,
  };
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
    const { code } = (await request.json()) as CallbackPayload;
    const normalizedCode = code?.trim();

    if (!normalizedCode) {
      return new Response(JSON.stringify({ error: "El code de Microsoft es obligatorio" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authority = Deno.env.get("ONEDRIVE_AUTHORITY")?.trim() || "consumers";
    const clientId = getRequiredEnv("ONEDRIVE_CLIENT_ID");
    const clientSecret = getRequiredEnv("ONEDRIVE_CLIENT_SECRET");
    const redirectUri = getRequiredEnv("ONEDRIVE_REDIRECT_URI");

    const tokenUrl = `https://login.microsoftonline.com/${authority}/oauth2/v2.0/token`;
    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: normalizedCode,
      redirect_uri: redirectUri,
      scope: "offline_access Files.ReadWrite User.Read",
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody,
    });

    const tokenPayload = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok) {
      throw new Error(tokenPayload.error_description || tokenPayload.error || "No se pudo completar el intercambio OAuth");
    }

    if (!tokenPayload.refresh_token || !tokenPayload.access_token) {
      throw new Error("Microsoft no devolvio access_token y refresh_token validos");
    }

    const profile = await getGraphProfile(tokenPayload.access_token);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { error: upsertError } = await supabaseAdmin
      .from("onedrive_integration_config")
      .upsert(
        {
          id: "primary",
          refresh_token: tokenPayload.refresh_token,
          account_email: profile.accountEmail,
          account_display_name: profile.accountDisplayName,
          last_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    if (upsertError) {
      throw new Error(`No se pudo guardar la conexion de OneDrive: ${upsertError.message}`);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        accountEmail: profile.accountEmail,
        accountDisplayName: profile.accountDisplayName,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "No se pudo completar la conexion de OneDrive",
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
