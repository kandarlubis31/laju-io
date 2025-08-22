import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function HomePage() {
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState('idle');
  const [joinCode, setJoinCode] = useState('');
  const [clientId] = useState(() => Math.random().toString(36).substring(2));

  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          console.log('Room updated!', payload.new);
          setRoom(payload.new);
          if (payload.new.status === 'connected') {
            setStatus('connected');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room]);

  const createRoom = async () => {
    setStatus('loading');
    const response = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId: clientId }),
    });
    const newRoom = await response.json();
    setRoom(newRoom);
    setIsHost(true);
    setStatus('waiting');
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    setStatus('loading');

    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', joinCode.toUpperCase())
      .eq('status', 'waiting')
      .single();

    if (data) {
      const { error: updateError } = await supabase
        .from('rooms')
        .update({ guest_id: clientId, status: 'connected' })
        .eq('id', data.id);

      if (!updateError) {
        setRoom(data);
        setStatus('connected');
      } else {
        setStatus('error');
      }
    } else {
      setStatus('error');
    }
  };

  if (status === 'connected') {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <h1 className={styles.title}>Terhubung!</h1>
          <p>Kalian sekarang terhubung di ruang {room.room_code}. Siap untuk kirim file.</p>
          {/* Di sini nanti kita taro komponen upload file */}
        </main>
      </div>
    )
  }

  if (status === 'waiting' && isHost) {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <h1 className={styles.title}>Ruang Dibuat!</h1>
          <p>Minta temanmu memasukkan kode ini:</p>
          <div className={styles.codeBox}>{room.room_code}</div>
          <p>Menunggu pasangan...</p>
        </main>
      </div>
    )
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
                className={styles.input}
                placeholder="Masukkan Kode"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <button type="submit">Gabung</button>
            </form>
          </div>
          <div className={styles.card}>
            <h2>Atau Buat Ruang Baru</h2>
            <button onClick={createRoom}>Buat Ruang</button>
          </div>
        </div>
        {status === 'loading' && <p>Loading...</p>}
        {status === 'error' && <p>Kode tidak ditemukan atau ruang sudah penuh.</p>}
      </main>
    </div>
  );
}