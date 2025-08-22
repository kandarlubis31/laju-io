import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

// Komponen baru untuk tampilan saat terhubung, biar lebih rapi
function ConnectedRoom({ room }) {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>✅ Terhubung!</h1>
        <p>
          Anda sekarang terhubung di ruang <strong>{room.room_code}</strong>.
        </p>
        <p>Siap untuk mengirim file.</p>
        {/* Di sini nanti kita letakkan komponen untuk upload file */}
      </main>
    </div>
  );
}

export default function HomePage() {
  const [room, setRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  
  // ID unik untuk setiap browser/device, agar tahu siapa host & guest
  const [clientId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = sessionStorage.getItem('clientId');
      if (!id) {
        id = Math.random().toString(36).substring(2, 10);
        sessionStorage.setItem('clientId', id);
      }
      return id;
    }
    return null;
  });

  // INI BAGIAN PALING PENTING: PENDENGAR REAL-TIME
  useEffect(() => {
    // Hanya mulai "nguping" kalau sudah ada di dalam sebuah room
    if (!room || !room.id) return;

    console.log(`Sekarang mendengarkan perubahan pada room ID: ${room.id}`);

    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${room.id}`, // Filter: hanya peduli pada room ini
        },
        (payload) => {
          // Ketika ada update, langsung perbarui state 'room' kita
          console.log('Update diterima dari Supabase!', payload.new);
          setRoom(payload.new);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('Berhasil terhubung ke channel realtime!');
        }
        if (err) {
          console.error('Gagal subscribe ke channel:', err);
        }
      });

    // Fungsi bersih-bersih: berhenti "nguping" kalau keluar dari halaman
    return () => {
      console.log('Berhenti mendengarkan channel.');
      supabase.removeChannel(channel);
    };
  }, [room?.id]); // Dependency diubah ke room.id, lebih stabil

  const createRoom = async () => {
    setIsLoading(true);
    setError('');
    const response = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId: clientId }),
    });
    
    if(response.ok) {
      const newRoom = await response.json();
      setRoom(newRoom);
    } else {
      setError('Gagal membuat room, coba lagi.');
    }
    setIsLoading(false);
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // 1. Cari dulu room yang mau digabung
    const { data: foundRoom, error: selectError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', joinCode.toUpperCase())
      .eq('status', 'waiting') // Hanya bisa join yang statusnya 'waiting'
      .single();

    if (selectError || !foundRoom) {
      setError('Kode tidak ditemukan atau room sudah penuh.');
      setIsLoading(false);
      return;
    }
    
    // 2. Jika ketemu, update statusnya jadi 'connected'
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ guest_id: clientId, status: 'connected' })
      .eq('id', foundRoom.id);

    if (updateError) {
      setError('Gagal terhubung ke room.');
      setIsLoading(false);
    } else {
      // PENTING: Setelah update, kita set state room-nya di sini
      // agar useEffect bisa langsung mulai "nguping" perubahan.
      // Tampilan akan berubah setelah siaran UPDATE diterima.
      setRoom(foundRoom);
    }
    // Biarkan isLoading tetap true, nanti akan false setelah room ter-update
  };

  // Logika untuk menentukan tampilan mana yang harus muncul
  if (room && room.status === 'connected') {
    return <ConnectedRoom room={room} />;
  }

  const isHost = room && room.host_id === clientId;

  if (isHost && room.status === 'waiting') {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <h1 className={styles.title}>Ruang Dibuat!</h1>
          <p>Minta temanmu memasukkan kode ini di device mereka:</p>
          <div className={styles.codeBox}>{room.room_code}</div>
          <p className={styles.status}>Menunggu pasangan...</p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Laju.io - Transfer File Cepat</title>
      </Head>
      <main className={styles.main}>
        <h1 className={styles.title}>Selamat Datang di Laju.io</h1>
        <div className={styles.grid}>
          <div className={styles.card}>
            <h2>Gabung ke Ruang</h2>
            <form onSubmit={joinRoom}>
              <input
                type="text"
                maxLength="4"
                className={styles.input}
                placeholder="ABCD"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading}>Gabung</button>
            </form>
          </div>
          <div className={styles.card}>
            <h2>Atau Buat Ruang Baru</h2>
            <button onClick={createRoom} disabled={isLoading}>Buat Ruang</button>
          </div>
        </div>
        {isLoading && <p className={styles.status}>Loading...</p>}
        {error && <p className={styles.error}>{error}</p>}
      </main>
    </div>
  );
}