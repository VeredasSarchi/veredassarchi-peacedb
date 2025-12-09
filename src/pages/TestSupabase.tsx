import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function TestSupabase() {
  useEffect(() => {
    async function test() {
      console.log("🔍 Probando conexión a Supabase...");

      const { data, error } = await supabase
        .from("cliente")
        .select("*")
        .limit(1);

      if (error) {
        console.error("❌ Error:", error);
      } else {
        console.log("✅ Conexión exitosa. Datos recibidos:", data);
      }
    }

    test();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Probando conexión a Supabase...</h1>
      <p>Mira la consola del navegador (F12 → Console)</p>
    </div>
  );
}
