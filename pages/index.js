import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { QRCodeCanvas } from 'qrcode.react';
import styles from '../styles/Home.module.css';

function ConnectedRoom({ room, clientId }) {
  const [uploadStatus, setUploadStatus] = useState('');
  const [incomingFile, setIncomingFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const isHost = room.host_id === clientId;

  const createThumbnail = (file) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 100;
          const MAX_HEIGHT = 100;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  useEffect(() => {
    const channel = supabase.channel(`room-broadcast:${room.id}`);
    channel
      .on('broadcast', { event: 'file-transfer' }, (payload) => {
        setIncomingFile(payload.payload);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room.id]);

  const handleUpload = async (file) => {
    setUploadStatus(`Mengunggah ${file.name}...`);
    setIncomingFile(null);

    const thumbnail = await createThumbnail(file);

    const response = await fetch('/api/generate-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, fileType: file.type }),
    });

    if (!response.ok) {
      setUploadStatus('Gagal mendapatkan izin unggah.');
      return;
    }

    const { uploadUrl, downloadUrl } = await response.json();
    const uploadResponse = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });

    if (!uploadResponse.ok) {
      setUploadStatus('Unggah file gagal.');
      return;
    }

    setUploadStatus('Unggah berhasil! Mengirim link...');

    const channel = supabase.channel(`room-broadcast:${room.id}`);
    await channel.send({
      type: 'broadcast',
      event: 'file-transfer',
      payload: { fileName: file.name, url: downloadUrl, thumbnail: thumbnail, type: file.type },
    });

    setUploadStatus(`Link untuk ${file.name} terkirim!`);
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div className={styles.connectedContainer} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {isDragging && <div className={styles.dragOverlay}>Letakkan file di sini</div>}
      <h1 className={styles.connectedTitle}>✅ Terhubung!</h1>
      <p className={styles.connectedSubtitle}>Ruang: <strong>{room.room_code}</strong></p>

      <div className={styles.transferArea}>
        {isHost ? (
          <div className={styles.uploadCard}>
            <h3>Kirim File</h3>
            <p>Pilih file atau seret ke sini.</p>
            <input type='file' ref={fileInputRef} onChange={(e) => handleUpload(e.target.files?.[0])} className={styles.fileInput} />
            <button onClick={() => fileInputRef.current?.click()} className={styles.uploadButton}>
              Pilih File
            </button>
          </div>
        ) : (
          incomingFile ? (
            <div className={styles.downloadCard}>
              <h3>File Diterima!</h3>
              {incomingFile.thumbnail ? (
                <img src={incomingFile.thumbnail} alt='preview' className={styles.filePreview} />
              ) : (
                <div className={styles.filePreview}>📄</div>
              )}
              <p className={styles.fileName}>{incomingFile.fileName}</p>
              <a href={incomingFile.url} download target='_blank' rel='noopener noreferrer' className={styles.downloadButton}>
                Unduh
              </a>
            </div>
          ) : (
            <div className={styles.uploadCard}>
              <h3>Menunggu File...</h3>
              <p>Pengirim sedang memilih file.</p>
            </div>
          )
        )}
      </div>
      <p className={styles.statusMessage}>{uploadStatus}</p>
    </div>
  );
}

function WaitingRoom({ room, onCancel }) {
  const [copyFeedback, setCopyFeedback] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(room.room_code);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  return (
    <div className={styles.waitingContainer}>
      <h1 className={styles.waitingTitle}>Ruang Dibuat!</h1>
      <p className={styles.waitingSubtitle}>Pindai QR Code atau bagikan kode di bawah:</p>
      <div className={styles.qrCode}>
        <QRCodeCanvas value={room.room_code} size={128} />
      </div>
      <div className={styles.roomCode} onClick={handleCopy}>
        {room.room_code}
        <span className={styles.copyFeedback} style={{ opacity: copyFeedback ? 1 : 0 }}>
          Tersalin!
        </span>
      </div>
      <p className={styles.waitingInfo}>Menunggu teman untuk bergabung...</p>
      <button onClick={onCancel} className={styles.cancelButton}>Kembali</button>
    </div>
  );
}

export default function HomePage() {
  const [room, setRoom] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedRoom = sessionStorage.getItem('laju-room');
      return savedRoom ? JSON.parse(savedRoom) : null;
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');

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

  useEffect(() => {
    if (room) {
      sessionStorage.setItem('laju-room', JSON.stringify(room));
    } else {
      sessionStorage.removeItem('laju-room');
    }
  }, [room]);

  useEffect(() => {
    if (!room?.id) return;
    const channel = supabase.channel(`room-db-changes:${room.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) => setRoom(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room?.id]);

  const createRoom = async () => {
    setIsLoading(true);
    setError('');
    const response = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId: clientId }),
    });
    if (response.ok) setRoom(await response.json());
    else setError('Gagal membuat room, coba lagi.');
    setIsLoading(false);
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    const { data, error } = await supabase.rpc('join_room_atomic', { p_room_code: joinCode.toUpperCase(), p_guest_id: clientId });
    if (error || !data || data.length === 0) setError('Kode tidak ditemukan atau room sudah penuh.');
    else setRoom(data[0]);
    setIsLoading(false);
  };

  const cancelRoom = async () => {
    if (room) {
      await supabase.from('rooms').delete().eq('id', room.id);
    }
    setRoom(null);
  };

  if (room && room.status === 'connected') return <ConnectedRoom room={room} clientId={clientId} />;
  if (room && room.host_id === clientId && room.status === 'waiting') return <WaitingRoom room={room} onCancel={cancelRoom} />;

  return (
    <div className={styles.homeContainer}>
      <Head>
        <title>Laju.io - Transfer File Cepat & Ringan</title>
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.ico' />
      </Head>
      <main className={styles.homeMain}>
        <h1 className={styles.homeTitle}>Selamat Datang di <span className={styles.logo}>Laju.io</span></h1>
        <p className={styles.homeSubtitle}>Transfer file super cepat tanpa ribet.</p>
        <div className={styles.actionButtons}>
          <div className={styles.card}>
            <h2>Gabung Ruang</h2>
            <form onSubmit={joinRoom} className={styles.form}>
              <input type='text' maxLength='4' className={styles.input} placeholder='Kode (4 Huruf)' value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} disabled={isLoading} />
              <button type='submit' className={styles.joinButton} disabled={isLoading}>{isLoading ? 'Memproses...' : 'Gabung'}</button>
            </form>
          </div>
          <div className={styles.card}>
            <h2>Buat Ruang Baru</h2>
            <button onClick={createRoom} className={styles.createButton} disabled={isLoading}>{isLoading ? 'Memproses...' : 'Buat'}</button>
          </div>
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </main>
      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} Laju.io - Dibuat dengan ❤️ untuk kemudahan.</p>
      </footer>
    </div>
  );
}