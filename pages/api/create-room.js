import { supabase } from "../../lib/supabaseClient";

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
export default async function handler(req, res) {
  console.log(
    "SERVER-SIDE Supabase URL:",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  console.log(
    "SERVER-SIDE Supabase Key Loaded:",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "ADA" : "TIDAK ADA / KOSONG"
  );

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }
  try {
    const { hostId } = req.body;

    if (!hostId) {
      return res.status(400).json({ message: "hostId is required" });
    }

    const roomCode = generateRoomCode();

    const { data, error } = await supabase
      .from("rooms")
      .insert([{ room_code: roomCode, host_id: hostId }])
      .select()
      .single(); // .single() penting agar hasilnya objek, bukan array

    // Jika ada error dari Supabase, lemparkan error-nya
    if (error) {
      throw error;
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error creating room:", error);
    return res
      .status(500)
      .json({ message: "Gagal membuat room", error: error.message });
  }
}
