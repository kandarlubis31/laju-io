import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import styles from '../styles/Home.module.css'; // Kita akan modifikasi CSS ini nanti

// --- Komponen untuk Tampilan Terhubung & Upload ---
function ConnectedRoom({ room }) {
 const [uploadStatus, setUploadStatus] = useState('');
 const [incomingFile, setIncomingFile] = useState(null);
 const fileInputRef = useRef(null);

 useEffect(() => {
   const channel = supabase.channel(`room-broadcast:${room.id}`);

   channel
     .on('broadcast', { event: 'file-transfer' }, (payload) => {
       console.log('Menerima broadcast file!', payload);
       setIncomingFile(payload.payload);
     })
     .subscribe((status) => {
       if (status === 'SUBSCRIBED') {
         console.log('Berhasil subscribe ke broadcast channel!');
       }
     });

   return () => {
     supabase.removeChannel(channel);
   };
 }, [room.id]);

 const handleFileSelect = (event) => {
   const file = event.target.files?.[0];
   if (file) {
     handleUpload(file);
   }
 };

 const handleUpload = async (file) => {
   setUploadStatus(`Mengupload ${file.name}...`);
   setIncomingFile(null);

   const response = await fetch('/api/generate-upload-url', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ fileName: file.name, fileType: file.type }),
   });

   if (!response.ok) {
     setUploadStatus('Gagal mendapatkan izin upload.');
     return;
   }

   const { uploadUrl, downloadUrl } = await response.json();

   const uploadResponse = await fetch(uploadUrl, {
     method: 'PUT',
     headers: { 'Content-Type': file.type },
     body: file,
   });

   if (!uploadResponse.ok) {
     setUploadStatus('Upload file gagal.');
     return;
   }

   setUploadStatus('Upload berhasil! Mengirim link...');

   const channel = supabase.channel(`room-broadcast:${room.id}`);
   await channel.send({
     type: 'broadcast',
     event: 'file-transfer',
     payload: { fileName: file.name, url: downloadUrl },
   });

   setUploadStatus(`Link untuk ${file.name} terkirim!`);
   if (fileInputRef.current) {
     fileInputRef.current.value = null; // Reset input file
   }
 };

 return (
   <div className={styles.connectedContainer}>
     <h1 className={styles.connectedTitle}>✅ Terhubung!</h1>
     <p className={styles.connectedSubtitle}>Ruang: <strong>{room.room_code}</strong></p>

     <div className={styles.transferArea}>
       {incomingFile ? (
         <div className={styles.downloadCard}>
           <h3>File Diterima!</h3>
           <p className={styles.fileName}>{incomingFile.fileName}</p>
           <a href={incomingFile.url} download target="_blank" rel="noopener noreferrer" className={styles.downloadButton}>
             Unduh
           </a>
         </div>
       ) : (
         <div className={styles.uploadCard}>
           <h3>Kirim File</h3>
           <input type="file" ref={fileInputRef} onChange={handleFileSelect} className={styles.fileInput} />
           <button onClick={() => fileInputRef.current?.click()} className={styles.uploadButton}>
             Pilih File
           </button>
         </div>
       )}
     </div>

     {uploadStatus && <p className={styles.statusMessage}>{uploadStatus}</p>}
   </div>
 );
}

// --- Komponen Utama & Logika Pairing ---
export default function HomePage() {
 const [room, setRoom] = useState(null);
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
   if (!room?.id) return;

   const channel = supabase
     .channel(`room-db-changes:${room.id}`)
     .on(
       'postgres_changes',
       { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
       (payload) => {
         setRoom(payload.new);
       }
     )
     .subscribe();

   return () => {
     supabase.removeChannel(channel);
   };
 }, [room?.id]);

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

   const { data: foundRoom, error: selectError } = await supabase
     .from('rooms')
     .select('*')
     .eq('room_code', joinCode.toUpperCase())
     .eq('status', 'waiting')
     .single();

   if (selectError || !foundRoom) {
     setError('Kode tidak ditemukan atau room sudah penuh.');
     setIsLoading(false);
     return;
   }

   const { error: updateError } = await supabase
     .from('rooms')
     .update({ guest_id: clientId, status: 'connected' })
     .eq('id', foundRoom.id);

   if (updateError) {
     setError('Gagal terhubung ke room.');
     setIsLoading(false);
   } else {
     setRoom(foundRoom);
   }
 };

 if (room && room.status === 'connected') {
   return <ConnectedRoom room={room} />;
 }

 const isHost = room && room.host_id === clientId;

 if (isHost && room.status === 'waiting') {
   return (
     <div className={styles.waitingContainer}>
       <h1 className={styles.waitingTitle}>Ruang Dibuat!</h1>
       <p className={styles.waitingSubtitle}>Bagikan kode ini:</p>
       <div className={styles.roomCode}>{room.room_code}</div>
       <p className={styles.waitingInfo}>Menunggu teman untuk bergabung...</p>
     </div>
   );
 }

 return (
   <div className={styles.homeContainer}>
     <Head>
       <title>Laju.io - Transfer File Cepat & Ringan</title>
     </Head>
     <main className={styles.homeMain}>
       <h1 className={styles.homeTitle}>Selamat Datang di <span className={styles.logo}>Laju.io</span></h1>
       <p className={styles.homeSubtitle}>Transfer file super cepat tanpa ribet.</p>
       <div className={styles.actionButtons}>
         <div className={styles.card}>
           <h2>Gabung Ruang</h2>
           <form onSubmit={joinRoom} className={styles.form}>
             <input
               type="text"
               maxLength="4"
               className={styles.input}
               placeholder="Kode (4 Huruf)"
               value={joinCode}
               onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
               disabled={isLoading}
             />
             <button type="submit" className={styles.joinButton} disabled={isLoading}>Gabung</button>
           </form>
         </div>
         <div className={styles.card}>
           <h2>Buat Ruang Baru</h2>
           <button onClick={createRoom} className={styles.createButton} disabled={isLoading}>Buat</button>
         </div>
       </div>
       {isLoading && <p className={styles.loading}>{isLoading ? 'Memproses...' : ''}</p>}
       {error && <p className={styles.error}>{error}</p>}
     </main>
     <footer className={styles.footer}>
       <p>&copy; {new Date().getFullYear()} Laju.io - Dibuat dengan ❤️ untuk kemudahan.</p>
     </footer>
   </div>
 );
}