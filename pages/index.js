import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import Head from 'next/head';
import Image from 'next/image';
import { QRCodeCanvas } from 'qrcode.react';
import JSZip from 'jszip';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Upload, Download, Share2, Copy, Check, X, File as FileIcon, 
  Image as ImageIcon, Video, Music, Archive, Wifi, WifiOff, 
  CheckCircle, Clock, History, User, Shield, Battery, BatteryCharging 
} from 'lucide-react';

// === INISIALISASI SUPABASE ===
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Error handling untuk inisialisasi Supabase
let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { 'x-application-name': 'laju-io' } }
  });
} catch (error) {
  console.error('Failed to initialize Supabase:', error);
}

// === UTILITY FUNCTIONS ===
const createThumbnail = (file) => {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) { 
      resolve(null); 
      return; 
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const MAX_SIZE = 120;
        
        let { width, height } = img;
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
        ctx.drawImage(img, 0, 0, width, height);
        
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } catch (error) {
          console.error('Error creating thumbnail:', error);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

const formatFileSize = (bytes) => {
  if (bytes === 0 || bytes === undefined) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatTime = (seconds) => {
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} menit ${seconds % 60} detik`;
};

// === CUSTOM HOOKS ===
const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      if (typeof window === 'undefined') return initialValue;
      const item = window.sessionStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading ${key} from sessionStorage:`, error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error setting ${key} to sessionStorage:`, error);
    }
  };

  return [storedValue, setValue];
};

const useRoomManagement = (clientId) => {
  const [room, setRoom] = useLocalStorage('laju-room', null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastActivity, setLastActivity] = useState(Date.now());

  const createRoom = useCallback(async () => {
    const toastId = toast.loading('Membuat room...');
    try {
      if (!clientId) throw new Error('Client ID belum siap.');
      
      const response = await fetch('/api/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: clientId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Gagal membuat ruang, coba lagi.');
      }
      
      const roomData = await response.json();
      setRoom(roomData);
      setLastActivity(Date.now());
      toast.success('Room berhasil dibuat!', { id: toastId, duration: 3000 });
    } catch (error) {
      toast.error(error.message, { id: toastId });
    }
  }, [clientId, setRoom]);

  const joinRoom = useCallback(async (roomCode) => {
    const toastId = toast.loading(`Mencoba bergabung ke ${roomCode}...`);
    try {
      if (!clientId) throw new Error('Client ID belum siap.');
      if (!roomCode || roomCode.length !== 4) throw new Error('Kode ruang harus 4 karakter.');
      
      const { data, error } = await supabase.rpc('join_room_atomic', { 
        p_room_code: roomCode.toUpperCase(), 
        p_guest_id: clientId 
      });
      
      if (error) throw new Error(error.message || 'Terjadi kesalahan saat bergabung.');
      if (!data || data.length === 0) throw new Error('Kode ruang tidak ditemukan atau sudah penuh.');
      
      setRoom(data[0]);
      setLastActivity(Date.now());
      toast.success(`Berhasil bergabung ke room ${roomCode}!`, { id: toastId, duration: 3000 });
    } catch (error) {
      toast.error(error.message, { id: toastId });
    }
  }, [clientId, setRoom]);

  const cancelRoom = useCallback(async () => {
    if (room) {
      try { 
        await supabase.from('rooms').delete().eq('id', room.id); 
      } catch (error) { 
        console.error('Error deleting room:', error);
        // Tidak perlu menampilkan error ke user karena mungkin room sudah dihapus
      }
    }
    setRoom(null);
    toast.success('Room telah ditutup.');
  }, [room, setRoom]);

  // Auto-cleanup room jika tidak aktif selama 30 menit
  useEffect(() => {
    if (!room) return;
    
    const cleanupInterval = setInterval(async () => {
      const inactiveTime = Date.now() - lastActivity;
      if (inactiveTime > 30 * 60 * 1000) { // 30 menit
        await cancelRoom();
      }
    }, 60 * 1000); // Check setiap menit
    
    return () => clearInterval(cleanupInterval);
  }, [room, lastActivity, cancelRoom]);

  // Real-time room updates
  useEffect(() => {
    if (!room?.id) {
      setConnectionStatus('disconnected');
      return;
    }
    
    let channel;
    try {
      channel = supabase.channel(`room-db-changes:${room.id}`)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'rooms', 
          filter: `id=eq.${room.id}` 
        }, (payload) => {
          setRoom(payload.new);
          setLastActivity(Date.now());
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setConnectionStatus('connected');
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionStatus('reconnecting');
          if (status === 'CLOSED') setConnectionStatus('closed');
        });
    } catch (error) {
      console.error('Error setting up room channel:', error);
      setConnectionStatus('error');
    }
    
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [room?.id, setRoom]);

  return { room, connectionStatus, createRoom, joinRoom, cancelRoom, lastActivity };
};

const useTransferHistory = () => {
  const [history, setHistory] = useLocalStorage('laju-transfer-history', []);
  
  const addToHistory = useCallback((item) => {
    setHistory(prev => {
      const newHistory = [item, ...prev].slice(0, 20); // Simpan 20 item terakhir
      return newHistory;
    });
  }, [setHistory]);
  
  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);
  
  return { history, addToHistory, clearHistory };
};

// === UI COMPONENTS ===
const LoadingSpinner = ({ size = 20, className = "" }) => (
  <div 
    className={`inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] ${className}`} 
    style={{ width: size, height: size }} 
    role="status"
  >
    <span className="sr-only">Loading...</span>
  </div>
);

const ConnectionStatus = ({ status, roomCode }) => {
  const statusConfig = {
    connected: { text: 'Terhubung', icon: <Wifi size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    disconnected: { text: 'Terputus', icon: <WifiOff size={14} />, color: 'text-gray-600', bg: 'bg-gray-100' },
    reconnecting: { text: 'Menyambung ulang...', icon: <LoadingSpinner size={14} />, color: 'text-amber-600', bg: 'bg-amber-100' },
    closed: { text: 'Tertutup', icon: <X size={14} />, color: 'text-gray-600', bg: 'bg-gray-100' },
    error: { text: 'Error', icon: <X size={14} />, color: 'text-red-600', bg: 'bg-red-100' }
  };
  
  const config = statusConfig[status] || statusConfig.disconnected;
  
  return (
    <div className="flex items-center justify-between w-full px-4 py-2">
      <div className="flex items-center gap-2">
        <div className={`rounded-full p-1 ${config.bg} ${config.color}`}>
          {config.icon}
        </div>
        <span className="text-sm font-medium">{config.text}</span>
        {roomCode && (
          <span className="text-sm text-gray-500 ml-2">• {roomCode}</span>
        )}
      </div>
      <div className="text-xs text-gray-500">
        <BatteryCharging size={14} className="inline mr-1" />
        <span>Laju.io v1.1</span>
      </div>
    </div>
  );
};

function FilePreview({ file, className = "" }) {
  if (file.thumbnail) {
    return (
      <div className={`relative ${className}`}>
        <Image 
          src={file.thumbnail} 
          alt="Pratinjau file" 
          width={120} 
          height={120} 
          className="rounded-lg object-cover mx-auto shadow-sm"
        />
        {file.type?.startsWith('image/') && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {file.type.split('/')[1].toUpperCase()}
          </div>
        )}
      </div>
    );
  }
  
  const type = file.type || '';
  let icon = <FileIcon size={48} className="text-gray-500" />;
  let badge = null;
  
  if (type.startsWith('image/')) {
    icon = <ImageIcon size={48} className="text-blue-500" />;
    badge = 'Gambar';
  } else if (type.startsWith('video/')) {
    icon = <Video size={48} className="text-red-500" />;
    badge = 'Video';
  } else if (type.startsWith('audio/')) {
    icon = <Music size={48} className="text-green-500" />;
    badge = 'Audio';
  } else if (type.includes('zip') || type.includes('archive')) {
    icon = <Archive size={48} className="text-yellow-500" />;
    badge = 'Archive';
  } else if (type.includes('pdf')) {
    badge = 'PDF';
  }
  
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="file-icon-area bg-gray-100 rounded-lg p-4 mb-2">
        {icon}
      </div>
      {badge && (
        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
          {badge}
        </span>
      )}
    </div>
  );
}

function TransferHistory({ history, clearHistory }) {
  if (history.length === 0) return null;
  
  return (
    <div className="mt-8 border-t pt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <History size={20} />
          Riwayat Transfer
        </h3>
        <button 
          onClick={clearHistory}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Bersihkan
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {history.slice(0, 6).map((item, index) => (
          <div key={index} className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="flex items-start justify-between">
              <div className="truncate flex-1">
                <div className="font-medium truncate">{item.fileName}</div>
                <div className="text-gray-500">{formatFileSize(item.size)}</div>
              </div>
              <div className="text-xs text-gray-400 ml-2">
                {new Date(item.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectedRoom({ room, connectionStatus, onCancel }) {
  const fileInputRef = useRef(null);
  const [incomingFile, setIncomingFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState('');
  const [transferSpeed, setTransferSpeed] = useState('');
  const { addToHistory } = useTransferHistory();
  const uploadStartTime = useRef(0);

  useEffect(() => {
    let channel;
    try {
      channel = supabase.channel(`room-broadcast:${room.id}`);
      channel
        .on('broadcast', { event: 'file-transfer' }, ({ payload }) => {
          setIncomingFile(payload);
          addToHistory({ ...payload, timestamp: Date.now(), direction: 'incoming' });
          toast.success(`Menerima file: ${payload.fileName}`);
        })
        .subscribe();
    } catch (error) {
      console.error('Error setting up broadcast channel:', error);
      toast.error('Gagal menyiapkan koneksi transfer');
    }
    
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [room.id, addToHistory]);

  const calculateTransferStats = (loaded, total, startTime) => {
    const elapsed = (Date.now() - startTime) / 1000; // in seconds
    if (elapsed > 0) {
      const speed = loaded / elapsed; // bytes per second
      setTransferSpeed(formatFileSize(speed) + '/s');
      
      const remaining = total - loaded;
      const estimated = remaining / speed;
      setEstimatedTime(formatTime(estimated));
    }
  };

  const handleUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    setTransferSpeed('');
    setEstimatedTime('');
    uploadStartTime.current = Date.now();
    
    const toastId = toast.loading('Mempersiapkan file...');

    try {
      let fileToUpload;
      let originalFileName;

      if (files.length > 1) {
        const zip = new JSZip();
        for (const file of files) zip.file(file.name, file);
        toast.loading('Mengompres file...', { id: toastId });
        fileToUpload = await zip.generateAsync({ 
          type: 'blob',
          compression: "DEFLATE",
          compressionOptions: { level: 6 } 
        });
        originalFileName = `laju-io-paket-${files.length}-files.zip`;
      } else {
        fileToUpload = files[0];
        originalFileName = fileToUpload.name;
      }

      if (fileToUpload.size > 200 * 1024 * 1024) {
        throw new Error('File terlalu besar (Maks 200MB).');
      }

      const thumbnail = await createThumbnail(files[0]);

      const response = await fetch('/api/generate-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileName: originalFileName, 
          fileType: fileToUpload.type 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Gagal mendapatkan izin upload.');
      }
      
      const { uploadUrl, downloadUrl } = await response.json();

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = (event.loaded / event.total) * 100;
          setUploadProgress(percent);
          calculateTransferStats(event.loaded, event.total, uploadStartTime.current);
          
          if (percent < 100) {
            toast.loading(
              `Mengupload ${originalFileName}... ${Math.round(percent)}%`, 
              { id: toastId }
            );
          }
        }
      };

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error('Upload gagal.'));
        xhr.onerror = () => reject(new Error('Upload gagal.'));
        xhr.onabort = () => reject(new Error('Upload dibatalkan.'));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', fileToUpload.type);
        xhr.send(fileToUpload);
      });

      await uploadPromise;
      toast.loading('Mengirim link...', { id: toastId });

      const payload = { 
        fileName: originalFileName, 
        url: downloadUrl, 
        thumbnail, 
        type: fileToUpload.type, 
        size: fileToUpload.size 
      };
      
      const channel = supabase.channel(`room-broadcast:${room.id}`);
      await channel.send({ type: 'broadcast', event: 'file-transfer', payload });
      
      addToHistory({ ...payload, timestamp: Date.now(), direction: 'outgoing' });
      toast.success(`File terkirim!`, { id: toastId, duration: 3000 });

    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.message, { id: toastId });
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        setUploadProgress(0);
        setTransferSpeed('');
        setEstimatedTime('');
      }, 2000);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  }, [room.id, addToHistory]);

  const handleDragOver = (e) => { 
    e.preventDefault(); 
    setIsDragging(true); 
  };
  
  const handleDragLeave = (e) => { 
    e.preventDefault(); 
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); 
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="app-container" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <ConnectionStatus status={connectionStatus} roomCode={room.room_code} />
      
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">
            <CheckCircle size={48} className="inline mr-4 text-emerald-500"/>
            Terhubung!
          </h1>
          <p className="page-subtitle">
            Ruang: <span className="font-bold text-teal-600">{room.room_code}</span>
            {room.host_id && (
              <span className="ml-4 text-sm text-gray-500">
                <User size={14} className="inline mr-1" />
                {room.guest_id ? '2 orang terkoneksi' : 'Menunggu peserta...'}
              </span>
            )}
          </p>
          <button onClick={onCancel} className="btn btn-outline mt-4">
            <X size={16} /> Keluar & Buat Sesi Baru
          </button>
        </div>
        
        {isDragging && (
          <div className="drag-overlay animate-scale-in">
            <div className="text-center">
              <Upload size={48} className="mx-auto mb-2"/>
              <div>Lepaskan file di sini!</div>
            </div>
          </div>
        )}
        
        {incomingFile ? (
          <div className="card animate-scale-in w-full max-w-md">
            <div className="text-center space-y-4">
              <div className="file-icon-area bg-emerald-100 mx-auto">
                <Download size={40} className="text-emerald-600"/>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-4">
                  <span className="text-emerald-600">✓</span> File Diterima!
                </h3>
              </div>
              <div className="space-y-3">
                <FilePreview file={incomingFile} />
                <div>
                  <p className="font-semibold text-gray-800 break-words px-4">
                    {incomingFile.fileName}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {formatFileSize(incomingFile.size)}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 justify-center pt-4">
                <a 
                  href={incomingFile.url} 
                  download={incomingFile.fileName} 
                  className="btn btn-primary"
                >
                  <Download size={20}/>Unduh File
                </a>
                <button 
                  onClick={() => setIncomingFile(null)} 
                  className="btn btn-outline"
                >
                  <X size={16}/>Tutup
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="transfer-area">
            <div className={`upload-zone ${isUploading ? 'opacity-75' : ''}`}>
              <div className="space-y-4">
                <div className="file-icon-area bg-teal-100">
                  <Upload size={40} className="text-teal-600"/>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">
                    Kirim File
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Pilih atau seret file ke sini
                  </p>
                  
                  {uploadProgress > 0 && (
                    <div className="space-y-2">
                      <div className="progress-container">
                        <div 
                          className="progress-bar" 
                          style={{ width: `${uploadProgress}%` }}
                        >
                          <div className="progress-text">
                            {Math.round(uploadProgress)}%
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{transferSpeed}</span>
                        <span>{estimatedTime}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => handleUpload(Array.from(e.target.files))} 
                  className="hidden" 
                  multiple
                  disabled={isUploading}
                />
                
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  disabled={isUploading} 
                  className="btn btn-secondary"
                >
                  {isUploading ? (
                    <>
                      <LoadingSpinner size={16}/>
                      Mengupload...
                    </>
                  ) : (
                    <>
                      <Upload size={20}/>
                      Pilih File
                    </>
                  )}
                </button>
                
                <div className="text-xs text-gray-500 text-center">
                  <Shield size={12} className="inline mr-1" />
                  File dienkripsi selama transfer
                </div>
              </div>
            </div>
          </div>
        )}
        
        <TransferHistory />
      </div>
    </div>
  );
};

const WaitingRoom = ({ room, onCancel }) => {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const roomUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}?room=${room.room_code}`;
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      toast.success('Kode tersalin!');
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Gagal menyalin kode.');
    }
  };

  return (
    <div className="app-container">
      <ConnectionStatus status="connected" roomCode={room.room_code} />
      
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">
            <Share2 size={48} className="inline mr-4 text-amber-500"/>
            Ruang Dibuat!
          </h1>
          <p className="page-subtitle">
            Bagikan kode atau scan QR untuk terhubung
          </p>
        </div>
        
        <div className="text-center space-y-6">
          <div className="qr-container">
            <QRCodeCanvas 
              value={roomUrl} 
              size={160} 
              bgColor="#ffffff" 
              fgColor="#0f766e" 
              level="M"
              includeMargin
            />
          </div>
          
          <div className="room-code-display">
            <button 
              onClick={() => handleCopy(room.room_code)} 
              className="room-code"
            >
              {room.room_code}
            </button>
            <div className={`copy-feedback ${copyFeedback ? 'show' : ''}`}>
              <Check size={16} className="inline mr-1"/>
              Tersalin!
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 text-gray-600">
              <div className="animate-pulse w-2 h-2 bg-amber-400 rounded-full"></div>
              <span>Menunggu teman untuk bergabung...</span>
            </div>
            
            <div className="text-sm text-gray-500">
              <Clock size={14} className="inline mr-1" />
              {formatTime(timeElapsed)}
            </div>
            
            <button onClick={onCancel} className="btn btn-outline">
              <X size={16}/>Batalkan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function LajuApp() {
  const [isLoading, setIsLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [clientId, setClientId] = useState(null);
  const { history, clearHistory } = useTransferHistory();

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
    try {
      await action(param);
    } catch (error) {
      console.error('Action error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (joinCode.trim()) handleAction(joinRoom, joinCode.trim());
  };

  if (!clientId) {
    return (
      <div className="app-container">
        <div className="main-content flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size={32} />
            <p className="mt-4 text-gray-600">Menyiapkan aplikasi...</p>
          </div>
        </div>
      </div>
    );
  }

  if (room?.status === 'connected') {
    return <ConnectedRoom room={room} connectionStatus={connectionStatus} onCancel={cancelRoom} />;
  }
  
  if (room?.host_id === clientId && room?.status === 'waiting') {
    return <WaitingRoom room={room} onCancel={cancelRoom} />;
  }

  return (
    <div className="app-container">
      <Head>
        <title>Laju.io - Transfer File Cepat & Ringan</title>
        <meta name="description" content="Transfer file langsung antar perangkat tanpa melalui server secara real-time." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <Toaster 
        position="bottom-center" 
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">Laju.io</h1>
          <p className="page-subtitle">
            Transfer file super cepat tanpa ribet. Langsung antar perangkat, aman dan mudah.
          </p>
        </div>
        
        <div className="action-grid">
          <div className="card action-card join-card animate-slide-in">
            <div className="card-icon">
              <Share2 size={32}/>
            </div>
            <h2 className="card-title">Gabung Ruang</h2>
            <p className="card-description">
              Masukkan kode ruang untuk bergabung
            </p>
            
            <form onSubmit={handleJoinSubmit} className="form-group">
              <input 
                type="text" 
                maxLength={4} 
                className="input-field code-input" 
                placeholder="KODE" 
                value={joinCode} 
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} 
                disabled={isLoading}
                pattern="[A-Z0-9]{4}"
                title="Masukkan 4 karakter kode ruang"
              />
              
              <button 
                type="submit" 
                disabled={isLoading || !joinCode.trim()} 
                className="btn btn-primary"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner/>Bergabung...
                  </>
                ) : (
                  <>
                    <Share2 size={20}/>Gabung Ruang
                  </>
                )}
              </button>
            </form>
          </div>
          
          <div 
            className="card action-card create-card animate-slide-in" 
            style={{animationDelay: '0.1s'}}
          >
            <div className="card-icon">
              <Upload size={32}/>
            </div>
            <h2 className="card-title">Buat Ruang Baru</h2>
            <p className="card-description">
              Mulai transfer file dengan membuat ruang baru
            </p>
            
            <div className="form-group">
              <button 
                onClick={() => handleAction(createRoom)} 
                disabled={isLoading} 
                className="btn btn-secondary"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner/>Membuat...
                  </>
                ) : (
                  <>
                    <Upload size={20}/>Buat Ruang
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        
        <TransferHistory history={history} clearHistory={clearHistory} />
      </div>
      
      <footer className="footer">
        <p>
          &copy; {new Date().getFullYear()} Laju.io - Dibuat dengan ❤️ untuk kemudahan transfer file.
        </p>
      </footer>
    </div>
  );
}