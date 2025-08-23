import { supabase } from '../../lib/supabaseClient';

// Fungsi kecil untuk membuat kode acak 4 karakter
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default async function handler(req, res) {
  // 1. "Satpam" yang memeriksa metode request
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 2. Blok try...catch untuk menangani error
  try {
    const { hostId } = req.body;
    
    // Jika hostId tidak dikirim, kirim error
    if (!hostId) {
        return res.status(400).json({ message: 'hostId is required' });
    }

    const roomCode = generateRoomCode();

    // 3. Perintah untuk memasukkan data room baru ke Supabase
    const { data, error } = await supabase
      .from('rooms')
      .insert([{ room_code: roomCode, host_id: hostId }])
      .select()
      .single(); // .single() penting agar hasilnya objek, bukan array

    // Jika ada error dari Supabase, lemparkan error-nya
    if (error) {
      throw error;
    }
    
    // 4. Jika berhasil, kirim data room yang baru dibuat
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error creating room:', error);
    return res.status(500).json({ message: 'Gagal membuat room', error: error.message });
  }
}