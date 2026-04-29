const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Falta configurar la variable ${name}`);
  }
  return value;
}

function generateState(): string {
  return crypto.randomUUID();
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
    const clientId = getRequiredEnv("ONEDRIVE_CLIENT_ID");
    const redirectUri = getRequiredEnv("ONEDRIVE_REDIRECT_URI");
    const authority = Deno.env.get("ONEDRIVE_AUTHORITY")?.trim() || "consumers";
    const state = generateState();

    const authorizationUrl = new URL(
      `https://login.microsoftonline.com/${authority}/oauth2/v2.0/authorize`,
    );
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_mode", "query");
    authorizationUrl.searchParams.set("scope", "offline_access Files.ReadWrite User.Read");
    authorizationUrl.searchParams.set("prompt", "consent");
    authorizationUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({
        authorizationUrl: authorizationUrl.toString(),
        state,
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
        error: error instanceof Error ? error.message : "No se pudo iniciar la autorizacion de OneDrive",
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
