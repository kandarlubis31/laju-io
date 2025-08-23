import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import Image from 'next/image';
import { QRCodeCanvas } from 'qrcode.react';
import JSZip from 'jszip';
import toast, { Toaster } from 'react-hot-toast';
import { Upload, Download, Share2, Copy, Check, X, File as FileIcon, Image as ImageIcon, Video, Music, Archive, Wifi, WifiOff, CheckCircle } from 'lucide-react';

// === UTILITY FUNCTIONS ===
const createThumbnail = (file) => {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 120;
        let { width, height } = img;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }}
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }}
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// === CUSTOM HOOK ===
const useRoomManagement = (clientId) => {
  const [room, setRoom] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    if (clientId && isInitialLoad) {
      const savedRoom = sessionStorage.getItem('laju-room');
      if (savedRoom) {
        setRoom(JSON.parse(savedRoom));
      }
      setIsInitialLoad(false);
    }
  }, [clientId, isInitialLoad]);

  useEffect(() => {
    if (!isInitialLoad) {
        if (room) {
          sessionStorage.setItem('laju-room', JSON.stringify(room));
        } else {
          sessionStorage.removeItem('laju-room');
        }
    }
  }, [room, isInitialLoad]);

  const createRoom = useCallback(async () => {
    const toastId = toast.loading('Membuat room...');
    try {
      if (!clientId) throw new Error('Client ID belum siap.');
      const response = await fetch('/api/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: clientId }),
      });
      if (!response.ok) throw new Error('Gagal membuat ruang, coba lagi.');
      const roomData = await response.json();
      setRoom(roomData);
      toast.success('Room berhasil dibuat!', { id: toastId });
    } catch (error) {
      toast.error(error.message, { id: toastId });
    }
  }, [clientId]);

  const joinRoom = useCallback(async (roomCode) => {
    const toastId = toast.loading(`Mencoba bergabung ke ${roomCode}...`);
    try {
      if (!clientId) throw new Error('Client ID belum siap.');
      const { data, error } = await supabase.rpc('join_room_atomic', { p_room_code: roomCode.toUpperCase(), p_guest_id: clientId });
      if (error || !data || data.length === 0) throw new Error('Kode ruang tidak ditemukan atau sudah penuh.');
      setRoom(data[0]);
      toast.success(`Berhasil bergabung ke room ${roomCode}!`, { id: toastId });
    } catch (error) {
      toast.error(error.message, { id: toastId });
    }
  }, [clientId]);

  const cancelRoom = useCallback(async () => {
    if (room) {
      try { await supabase.from('rooms').delete().eq('id', room.id); }
      catch (error) { console.error('Error deleting room:', error); }
    }
    setRoom(null);
    toast.success('Room telah ditutup.');
  }, [room]);

  useEffect(() => {
    if (!room?.id) { setConnectionStatus('disconnected'); return; }
    const channel = supabase.channel(`room-db-changes:${room.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) => setRoom(payload.new))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionStatus('reconnecting');
        if (status === 'CLOSED') setConnectionStatus('closed');
      });
    return () => { supabase.removeChannel(channel); };
  }, [room?.id]);

  return { room, connectionStatus, createRoom, joinRoom, cancelRoom };
};

// === UI COMPONENTS ===
const LoadingSpinner = ({ size = 20 }) => (
  <div className="inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em]" style={{ width: size, height: size }} role="status"></div>
);

function FilePreview({ file }) {
  if (file.thumbnail) {
    return <Image src={file.thumbnail} alt="Pratinjau file" className="file-preview mx-auto" width={120} height={120} />;
  }
  const type = file.type || '';
  let icon = <FileIcon size={48} className="text-gray-500" />;
  if (type.startsWith('image/')) icon = <ImageIcon size={48} className="text-blue-500" />;
  if (type.startsWith('video/')) icon = <Video size={48} className="text-red-500" />;
  if (type.startsWith('audio/')) icon = <Music size={48} className="text-green-500" />;
  if (type.includes('zip') || type.includes('archive')) icon = <Archive size={48} className="text-yellow-500" />;
  return <div className="file-icon-area bg-gray-100 mx-auto">{icon}</div>;
}

function ConnectedRoom({ room, connectionStatus }) {
  const fileInputRef = useRef(null);
  const [incomingFile, setIncomingFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const channel = supabase.channel(`room-broadcast:${room.id}`);
    channel
      .on('broadcast', { event: 'file-transfer' }, ({ payload }) => {
        setIncomingFile(payload);
        toast.success(`Menerima file: ${payload.fileName}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room.id]);

  const handleUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);
    const toastId = toast.loading('Mempersiapkan file...');

    try {
      let fileToUpload;
      let originalFileName;

      if (files.length > 1) {
        const zip = new JSZip();
        for (const file of files) zip.file(file.name, file);
        toast.loading('Mengompres file...', { id: toastId });
        fileToUpload = await zip.generateAsync({ type: 'blob' });
        originalFileName = `laju-io-paket-${files.length}-files.zip`;
      } else {
        fileToUpload = files[0];
        originalFileName = fileToUpload.name;
      }

      if (fileToUpload.size > 200 * 1024 * 1024) throw new Error('File terlalu besar (Maks 200MB).');

      const thumbnail = await createThumbnail(files[0]);

      const response = await fetch('/api/generate-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: originalFileName, fileType: fileToUpload.type }),
      });
      if (!response.ok) throw new Error('Gagal mendapatkan izin upload.');
      const { uploadUrl, downloadUrl } = await response.json();

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = (event.loaded / event.total) * 100;
          setUploadProgress(percent);
          if (percent < 100) {
            toast.loading(`Mengupload ${originalFileName}... ${Math.round(percent)}%`, { id: toastId });
          }
        }
      };

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error('Upload gagal.'));
        xhr.onerror = () => reject(new Error('Upload gagal.'));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', fileToUpload.type);
        xhr.send(fileToUpload);
      });

      await uploadPromise;
      toast.loading('Mengirim link...', { id: toastId });

      const payload = { fileName: originalFileName, url: downloadUrl, thumbnail, type: fileToUpload.type, size: fileToUpload.size };
      const channel = supabase.channel(`room-broadcast:${room.id}`);
      await channel.send({ type: 'broadcast', event: 'file-transfer', payload });
      toast.success(`File terkirim!`, { id: toastId });

    } catch (error) {
      toast.error(error.message, { id: toastId });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 2000);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  }, [room.id]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleUpload(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="app-container" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <div className="connection-status">
        <div className={`status-indicator ${connectionStatus === 'connected' ? 'status-connected' : connectionStatus === 'reconnecting' ? 'status-reconnecting' : 'status-disconnected'}`} />
        <span className="text-sm font-medium">{connectionStatus}</span>
      </div>
      <div className="main-content">
        <div className="page-header"><h1 className="page-title"><CheckCircle size={48} className="inline mr-4 text-emerald-500"/>Terhubung!</h1><p className="page-subtitle">Ruang: <span className="font-bold text-teal-600">{room.room_code}</span></p></div>
        {isDragging && <div className="drag-overlay animate-scale-in"><div className="text-center"><Upload size={48} className="mx-auto mb-2"/><div>Lepaskan file di sini!</div></div></div>}
        {incomingFile ? (
          <div className="card animate-scale-in w-full max-w-md">
            <div className="text-center space-y-4">
              <div className="file-icon-area bg-emerald-100 mx-auto"><Download size={40} className="text-emerald-600"/></div>
              <div><h3 className="text-xl font-bold text-gray-800 mb-4"><span className="text-emerald-600">✓</span> File Diterima!</h3></div>
              <div className="space-y-3">
                <FilePreview file={incomingFile} />
                <div><p className="font-semibold text-gray-800 break-words px-4">{incomingFile.fileName}</p><p className="text-sm text-gray-600 mt-1">{formatFileSize(incomingFile.size)}</p></div>
              </div>
              <div className="flex gap-3 justify-center pt-4"><a href={incomingFile.url} download={incomingFile.fileName} className="btn btn-primary"><Download size={20}/>Unduh File</a><button onClick={() => setIncomingFile(null)} className="btn btn-outline"><X size={16}/>Tutup</button></div>
            </div>
          </div>
        ) : (
          <div className="transfer-area">
            <div className={`upload-zone ${isUploading ? 'opacity-75' : ''}`}>
              <div className="space-y-4">
                <div className="file-icon-area bg-teal-100"><Upload size={40} className="text-teal-600"/></div>
                <div><h3 className="text-xl font-bold text-gray-800 mb-2">Kirim File</h3><p className="text-gray-600 mb-4">Pilih atau seret file ke sini</p>{uploadProgress > 0 && <div className="progress-container"><div className="progress-bar" style={{ width: `${uploadProgress}%` }}><div className="progress-text">{Math.round(uploadProgress)}%</div></div></div>}</div>
                <input type="file" ref={fileInputRef} onChange={(e) => handleUpload(Array.from(e.target.files))} className="hidden" multiple/>
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="btn btn-secondary">{isUploading ? <><LoadingSpinner size={16}/>Mengupload...</> : <><Upload size={20}/>Pilih File</>}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const WaitingRoom = ({ room, onCancel }) => {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const roomUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}?room=${room.room_code}`;

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      toast.success('Kode tersalin!');
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (error) { console.error('Failed to copy:', error); toast.error('Gagal menyalin kode.'); }
  };

  return (
    <div className="app-container">
      <div className="main-content">
        <div className="page-header"><h1 className="page-title"><Share2 size={48} className="inline mr-4 text-amber-500"/>Ruang Dibuat!</h1><p className="page-subtitle">Bagikan kode atau scan QR untuk terhubung</p></div>
        <div className="text-center space-y-6">
          <div className="qr-container"><QRCodeCanvas value={roomUrl} size={128} bgColor="#ffffff" fgColor="#0f766e" /></div>
          <div className="room-code-display"><button onClick={() => handleCopy(room.room_code)} className="room-code">{room.room_code}</button><div className={`copy-feedback ${copyFeedback ? 'show' : ''}`}><Check size={16} className="inline mr-1"/>Tersalin!</div></div>
          <div className="space-y-4"><div className="flex items-center justify-center gap-3 text-gray-600"><div className="animate-pulse w-2 h-2 bg-amber-400 rounded-full"></div><span>Menunggu teman untuk bergabung...</span></div><button onClick={onCancel} className="btn btn-outline"><X size={16}/>Batalkan</button></div>
        </div>
      </div>
    </div>
  );
};

export default function LajuApp() {
  const [isLoading, setIsLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [clientId, setClientId] = useState(null);

  useEffect(() => {
    let id = sessionStorage.getItem('clientId');
    if (!id) {
      id = Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem('clientId', id);
    }
    setClientId(id);
  }, []);

  const { room, connectionStatus, createRoom, joinRoom, cancelRoom } = useRoomManagement(clientId);

  useEffect(() => {
    if (!room) {
      const urlParams = new URLSearchParams(window.location.search);
      const roomCodeFromUrl = urlParams.get('room');
      if (roomCodeFromUrl) {
        setJoinCode(roomCodeFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [room]);

  const handleAction = async (action, param) => {
    setIsLoading(true);
    await action(param);
    setIsLoading(false);
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (joinCode.trim()) handleAction(joinRoom, joinCode.trim());
  };

  if (!clientId) {
    return (
      <div className="app-container">
        <div className="main-content">
          <LoadingSpinner size={32} />
        </div>
      </div>
    );
  }

  if (room?.status === 'connected') return <ConnectedRoom room={room} connectionStatus={connectionStatus} />;
  if (room?.host_id === clientId && room?.status === 'waiting') return <WaitingRoom room={room} onCancel={cancelRoom} />;

  return (
    <div className="app-container">
      <Head>
        <title>Laju.io - Transfer File Cepat & Ringan</title>
        <meta name="description" content="Transfer file langsung antar perangkat tanpa melalui server secara real-time." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Toaster position="bottom-center" />
      <div className="main-content">
        <div className="page-header"><h1 className="page-title">Laju.io</h1><p className="page-subtitle">Transfer file super cepat tanpa ribet. Langsung antar perangkat, aman dan mudah.</p></div>
        <div className="action-grid">
          <div className="card action-card join-card animate-slide-in"><div className="card-icon"><Share2 size={32}/></div><h2 className="card-title">Gabung Ruang</h2><p className="card-description">Masukkan kode ruang untuk bergabung</p><form onSubmit={handleJoinSubmit} className="form-group"><input type="text" maxLength={4} className="input-field code-input" placeholder="KODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} disabled={isLoading}/><button type="submit" disabled={isLoading || !joinCode.trim()} className="btn btn-primary">{isLoading ? <><LoadingSpinner/>Bergabung...</> : <><Share2 size={20}/>Gabung Ruang</>}</button></form></div>
          <div className="card action-card create-card animate-slide-in" style={{animationDelay: '0.1s'}}><div className="card-icon"><Upload size={32}/></div><h2 className="card-title">Buat Ruang Baru</h2><p className="card-description">Mulai transfer file dengan membuat ruang baru</p><div className="form-group"><button onClick={() => handleAction(createRoom)} disabled={isLoading} className="btn btn-secondary">{isLoading ? <><LoadingSpinner/>Membuat...</> : <><Upload size={20}/>Buat Ruang</>}</button></div></div>
        </div>
      </div>
      <footer className="footer"><p>&copy; {new Date().getFullYear()} Laju.io - Dibuat dengan ❤️ untuk kemudahan transfer file.</p></footer>
    </div>
  );
}