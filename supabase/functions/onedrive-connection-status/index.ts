import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseAdmin = createClient(
      getRequiredEnv("SUPABASE_URL"),
      getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { data, error } = await supabaseAdmin
      .from("onedrive_integration_config")
      .select("id, account_email, account_display_name, last_connected_at, updated_at")
      .eq("id", "primary")
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo consultar el estado de OneDrive: ${error.message}`);
    }

    return new Response(
      JSON.stringify({
        connected: Boolean(data),
        accountEmail: data?.account_email ?? null,
        accountDisplayName: data?.account_display_name ?? null,
        lastConnectedAt: data?.last_connected_at ?? null,
        updatedAt: data?.updated_at ?? null,
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
        error: error instanceof Error ? error.message : "No se pudo consultar el estado de OneDrive",
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
