import { supabase } from '../../lib/supabaseClient';

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { hostId } = req.body;
    const roomCode = generateRoomCode();

    const { data, error } = await supabase
      .from('rooms')
      .insert([{ room_code: roomCode, host_id: hostId }])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data);
  }
  res.status(405).end();
}