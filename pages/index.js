import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { QRCodeCanvas } from 'qrcode.react';
import styles from '../styles/Home.module.css';

// Utility function untuk membuat thumbnail
const createThumbnail = (file) => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 100;
        let { width, height } = img;

        // Calculate dimensions while maintaining aspect ratio
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

// Custom hook untuk room management
const useRoomManagement = (clientId) => {
  const [room, setRoom] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedRoom = sessionStorage.getItem('laju-room');
      return savedRoom ? JSON.parse(savedRoom) : null;
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
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'rooms', 
        filter: `id=eq.${room.id}` 
      }, (payload) => setRoom(payload.new))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room?.id]);

  const createRoom = async () => {
    try {
      const response = await fetch('/api/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: clientId }),
      });

      if (!response.ok) {
        throw new Error('Gagal membuat room, coba lagi.');
      }

      const roomData = await response.json();
      setRoom(roomData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const joinRoom = async (roomCode) => {
    try {
      const { data, error } = await supabase.rpc('join_room_atomic', { 
        p_room_code: roomCode.toUpperCase(), 
        p_guest_id: clientId 
      });

      if (error || !data || data.length === 0) {
        throw new Error('Kode tidak ditemukan atau room sudah penuh.');
      }

      setRoom(data[0]);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const cancelRoom = async () => {
    if (room) {
      try {
        await supabase.from('rooms').delete().eq('id', room.id);
      } catch (error) {
        console.error('Error deleting room:', error);
      }
    }
    setRoom(null);
  };

  return { room, setRoom, createRoom, joinRoom, cancelRoom };
};

// Custom hook untuk file transfer
const useFileTransfer = (roomId) => {
  const [uploadStatus, setUploadStatus] = useState('');
  const [incomingFile, setIncomingFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`room-broadcast:${roomId}`);
    channel
      .on('broadcast', { event: 'file-transfer' }, (payload) => {
        setIncomingFile(payload.payload);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const handleUpload = useCallback(async (file) => {
    if (!file) return;
    
    setUploadStatus(`Mengupload ${file.name}...`);
    setIncomingFile(null);
    setTransferProgress(0);

    try {
      // Create thumbnail for images
      const thumbnail = file.type.startsWith('image/') ? await createThumbnail(file) : null;

      // Get upload URL
      const response = await fetch('/api/generate-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileName: file.name, 
          fileType: file.type,
          fileSize: file.size 
        }),
      });

      if (!response.ok) {
        throw new Error('Gagal mendapatkan izin upload.');
      }

      const { uploadUrl, downloadUrl } = await response.json();

      // Upload file with progress tracking
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setTransferProgress(percentComplete);
        }
      });

      const uploadSuccess = await new Promise((resolve) => {
        xhr.addEventListener('load', () => {
          resolve(xhr.status >= 200 && xhr.status < 300);
        });
        
        xhr.addEventListener('error', () => resolve(false));
        xhr.addEventListener('abort', () => resolve(false));
        
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      if (!uploadSuccess) {
        throw new Error('Upload file gagal.');
      }

      setUploadStatus('Upload berhasil! Mengirim link...');

      // Broadcast file info to other user in the room
      const channel = supabase.channel(`room-broadcast:${roomId}`);
      await channel.send({
        type: 'broadcast',
        event: 'file-transfer',
        payload: { 
          fileName: file.name, 
          url: downloadUrl, 
          thumbnail, 
          type: file.type,
          size: file.size 
        },
      });

      setUploadStatus(`Link untuk ${file.name} terkirim!`);
      setTransferProgress(100);
      
      // Reset progress after a delay
      setTimeout(() => setTransferProgress(0), 2000);
    } catch (error) {
      setUploadStatus(error.message || 'Terjadi kesalahan saat upload.');
      setTransferProgress(0);
    }
  }, [roomId]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        setUploadStatus('File terlalu besar. Maksimum 100MB.');
        return;
      }
      handleUpload(file);
    }
  }, [handleUpload]);

  return {
    uploadStatus,
    incomingFile,
    isDragging,
    transferProgress,
    handleUpload,
    onDragOver,
    onDragLeave,
    onDrop,
    setIncomingFile
  };
};

// --- Komponen untuk Tampilan Terhubung & Upload ---
function ConnectedRoom({ room }) {
  const fileInputRef = useRef(null);
  const {
    uploadStatus,
    incomingFile,
    isDragging,
    transferProgress,
    handleUpload,
    onDragOver,
    onDragLeave,
    onDrop,
    setIncomingFile
  } = useFileTransfer(room.id);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        setUploadStatus('File terlalu besar. Maksimum 100MB.');
        return;
      }
      handleUpload(file);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div 
      className={styles.connectedContainer} 
      onDragOver={onDragOver} 
      onDragLeave={onDragLeave} 
      onDrop={onDrop}
    >
      {isDragging && <div className={styles.dragOverlay}>Letakkan file di sini</div>}
      <h1 className={styles.connectedTitle}>✅ Terhubung!</h1>
      <p className={styles.connectedSubtitle}>Ruang: <strong>{room.room_code}</strong></p>

      <div className={styles.transferArea}>
        {incomingFile ? (
          <div className={styles.downloadCard}>
            <h3>File Diterima!</h3>
            {incomingFile.thumbnail ? (
              <img src={incomingFile.thumbnail} alt="preview" className={styles.filePreview} />
            ) : (
              <div className={styles.fileIcon}>
                {incomingFile.type?.startsWith('image/') ? '🖼️' : '📄'}
              </div>
            )}
            <p className={styles.fileName}>{incomingFile.fileName}</p>
            {incomingFile.size && (
              <p className={styles.fileSize}>{formatFileSize(incomingFile.size)}</p>
            )}
            <a 
              href={incomingFile.url} 
              download 
              target="_blank" 
              rel="noopener noreferrer" 
              className={styles.downloadButton}
            >
              Unduh
            </a>
            <button 
              onClick={() => setIncomingFile(null)} 
              className={styles.backButton}
            >
              Kembali
            </button>
          </div>
        ) : (
          <div className={styles.uploadCard}>
            <h3>Kirim File</h3>
            <p>Pilih file atau seret ke sini. (Maks. 100MB)</p>
            
            {transferProgress > 0 && transferProgress < 100 && (
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill} 
                  style={{ width: `${transferProgress}%` }}
                ></div>
                <span className={styles.progressText}>
                  {Math.round(transferProgress)}%
                </span>
              </div>
            )}
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              className={styles.fileInput} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className={styles.uploadButton}
              disabled={transferProgress > 0 && transferProgress < 100}
            >
              {transferProgress > 0 ? 'Mengupload...' : 'Pilih File'}
            </button>
          </div>
        )}
      </div>
      <p className={styles.statusMessage}>{uploadStatus}</p>
    </div>
  );
}

// --- Komponen Menunggu (Host) ---
function WaitingRoom({ room, onCancel }) {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const roomUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}?room=${room.room_code}` 
    : '';

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  return (
    <div className={styles.waitingContainer}>
      <h1 className={styles.waitingTitle}>Ruang Dibuat!</h1>
      <p className={styles.waitingSubtitle}>Pindai QR Code atau bagikan kode di bawah:</p>
      <div className={styles.qrCode}>
        <QRCodeCanvas value={roomUrl} size={128} />
      </div>
      <div className={styles.roomCode} onClick={() => handleCopy(room.room_code)}>
        {room.room_code}
        <span className={styles.copyFeedback} style={{ opacity: copyFeedback ? 1 : 0 }}>
          Tersalin!
        </span>
      </div>
      <p className={styles.waitingInfo}>Menunggu teman untuk bergabung...</p>
      <button onClick={onCancel} className={styles.cancelButton}>Batalkan</button>
    </div>
  );
}

// --- Komponen Utama & Logika Pairing ---
export default function HomePage() {
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

  const { room, createRoom, joinRoom, cancelRoom } = useRoomManagement(clientId);

  useEffect(() => {
    // Handle direct room access via URL parameter
    if (typeof window !== 'undefined' && !room) {
      const urlParams = new URLSearchParams(window.location.search);
      const roomCode = urlParams.get('room');
      if (roomCode) {
        setJoinCode(roomCode);
      }
    }
  }, [room]);

  const handleCreateRoom = async () => {
    setIsLoading(true);
    setError('');
    const result = await createRoom();
    if (!result.success) {
      setError(result.error);
    }
    setIsLoading(false);
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinCode.trim() || joinCode.length !== 4) {
      setError('Kode harus 4 karakter');
      return;
    }
    
    setIsLoading(true);
    setError('');
    const result = await joinRoom(joinCode);
    if (!result.success) {
      setError(result.error);
    }
    setIsLoading(false);
  };

  if (room && room.status === 'connected') {
    return <ConnectedRoom room={room} />;
  }
  
  if (room && room.host_id === clientId && room.status === 'waiting') {
    return <WaitingRoom room={room} onCancel={cancelRoom} />;
  }

  return (
    <div className={styles.homeContainer}>
      <Head>
        <title>Laju.io - Transfer File Cepat & Ringan</title>
        <meta name="description" content="Transfer file langsung antar perangkat tanpa melalui server" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.homeMain}>
        <h1 className={styles.homeTitle}>Selamat Datang di <span className={styles.logo}>Laju.io</span></h1>
        <p className={styles.homeSubtitle}>Transfer file super cepat tanpa ribet.</p>
        <div className={styles.actionButtons}>
          <div className={styles.card}>
            <h2>Gabung Ruang</h2>
            <form onSubmit={handleJoinRoom} className={styles.form}>
              <input 
                type="text" 
                maxLength="4" 
                className={styles.input} 
                placeholder="Kode (4 Huruf)" 
                value={joinCode} 
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())} 
                disabled={isLoading} 
                pattern="[A-Za-z0-9]{4}"
                title="Masukkan 4 karakter kode ruang"
                required
              />
              <button 
                type="submit" 
                className={styles.joinButton} 
                disabled={isLoading}
              >
                {isLoading ? 'Memproses...' : 'Gabung'}
              </button>
            </form>
          </div>
          <div className={styles.card}>
            <h2>Buat Ruang Baru</h2>
            <button 
              onClick={handleCreateRoom} 
              className={styles.createButton} 
              disabled={isLoading}
            >
              {isLoading ? 'Memproses...' : 'Buat'}
            </button>
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