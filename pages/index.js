import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Download, Share2, Copy, Check, AlertCircle, Wifi, WifiOff, File, Image, Video, Music, X, CheckCircle, Info } from 'lucide-react';

// Mock Supabase untuk demonstrasi
const mockSupabase = {
  channel: (name) => ({
    on: () => mockSupabase.channel(name),
    send: () => Promise.resolve(),
    subscribe: () => {},
  }),
  removeChannel: () => {},
  from: () => ({
    delete: () => ({ eq: () => Promise.resolve() })
  }),
  rpc: (fn, params) => Promise.resolve({ 
    data: [{ 
      id: 1, 
      room_code: params.p_room_code, 
      status: 'connected',
      host_id: params.p_guest_id === 'host123' ? params.p_guest_id : 'host123'
    }], 
    error: null 
  })
};

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
        const MAX_SIZE = 120;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
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

const getFileIcon = (fileType) => {
  if (fileType?.startsWith('image/')) return <Image size={32} className="text-blue-500" />;
  if (fileType?.startsWith('video/')) return <Video size={32} className="text-red-500" />;
  if (fileType?.startsWith('audio/')) return <Music size={32} className="text-green-500" />;
  return <File size={32} className="text-gray-500" />;
};

// === CUSTOM HOOKS ===
const useRoomManagement = (clientId) => {
  const [room, setRoom] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedRoom = sessionStorage.getItem('laju-room');
      return savedRoom ? JSON.parse(savedRoom) : null;
    }
    return null;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (room) sessionStorage.setItem('laju-room', JSON.stringify(room));
      else sessionStorage.removeItem('laju-room');
    }
  }, [room]);

  const createRoom = useCallback(async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
      const roomData = { 
        id: Date.now(), 
        room_code: roomCode, 
        host_id: clientId, 
        status: 'waiting',
        created_at: new Date().toISOString()
      };
      setRoom(roomData);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Gagal membuat ruang. Coba lagi.' };
    }
  }, [clientId]);

  const joinRoom = useCallback(async (roomCode) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate API call
      const { data, error } = await mockSupabase.rpc('join_room_atomic', { 
        p_room_code: roomCode.toUpperCase(), 
        p_guest_id: clientId 
      });
      if (error || !data || data.length === 0) 
        throw new Error('Kode ruang tidak ditemukan atau sudah penuh.');
      setRoom(data[0]);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }, [clientId]);

  const cancelRoom = useCallback(async () => {
    if (room) {
      try {
        await mockSupabase.from('rooms').delete().eq('id', room.id);
      } catch (error) {
        console.error('Error deleting room:', error);
      }
    }
    setRoom(null);
  }, [room]);

  return { room, createRoom, joinRoom, cancelRoom };
};

// === UI COMPONENTS ===
const Toast = ({ message, type = 'info', isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle size={20} />;
      case 'error': return <AlertCircle size={20} />;
      default: return <Info size={20} />;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'success': return 'toast toast-success';
      case 'error': return 'toast toast-error';
      default: return 'toast toast-info';
    }
  };

  return (
    <div className={`${getStyles()} ${isVisible ? 'show' : ''} animate-slide-in`}>
      <div className="toast-content">
        {getIcon()}
        <span>{message}</span>
        <button 
          onClick={onClose}
          className="ml-2 hover:opacity-70 transition-opacity"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

const ConnectionStatus = ({ isConnected }) => {
  return (
    <div className="connection-status animate-slide-in">
      <div className={`status-indicator ${isConnected ? 'status-connected' : 'status-disconnected'}`}></div>
      {isConnected ? (
        <>
          <Wifi size={16} className="text-emerald-600" />
          <span className="text-sm font-medium text-emerald-700">Terhubung</span>
        </>
      ) : (
        <>
          <WifiOff size={16} className="text-red-500" />
          <span className="text-sm font-medium text-red-700">Terputus</span>
        </>
      )}
    </div>
  );
};

const LoadingSpinner = ({ size = 24 }) => (
  <div 
    className="inline-block animate-spin rounded-full border-2 border-solid border-current border-r-transparent"
    style={{ width: size, height: size }}
  >
    <span className="sr-only">Loading...</span>
  </div>
);

const QRCodeDisplay = ({ value }) => {
  return (
    <div className="qr-container animate-scale-in">
      <div className="w-32 h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center border-2 border-gray-300">
        <div className="text-center">
          <div className="text-2xl mb-2">📱</div>
          <div className="text-xs text-gray-600 font-mono">
            QR: {value?.slice(-4) || 'XXXX'}
          </div>
        </div>
      </div>
    </div>
  );
};

const FileUploadArea = ({ onFileUpload, isUploading, uploadProgress }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFileUpload(files[0]);
    }
  };

  return (
    <div className="transfer-area">
      {isDragging && (
        <div className="drag-overlay animate-scale-in">
          <div className="text-center">
            <Upload size={48} className="mx-auto mb-2" />
            <div>Lepaskan file di sini!</div>
          </div>
        </div>
      )}
      
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''} ${isUploading ? 'opacity-75' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="space-y-4">
          <div className="file-icon-area bg-gradient-to-br from-teal-100 to-teal-200">
            <Upload size={40} className="text-teal-600" />
          </div>
          
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Kirim File</h3>
            <p className="text-gray-600 mb-4">
              Pilih file atau seret & lepas di sini
            </p>
            
            {uploadProgress > 0 && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                  <div className="progress-text">
                    {Math.round(uploadProgress)}%
                  </div>
                </div>
              </div>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => onFileUpload(e.target.files?.[0])}
            className="hidden"
            accept="*/*"
          />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="btn btn-secondary btn-large"
          >
            {isUploading ? (
              <>
                <LoadingSpinner size={16} />
                Mengupload...
              </>
            ) : (
              <>
                <Upload size={20} />
                Pilih File
              </>
            )}
          </button>
          
          <p className="text-sm text-gray-500">
            Maksimum ukuran: 100MB
          </p>
        </div>
      </div>
    </div>
  );
};

const FileDownloadCard = ({ file, onDismiss }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Simulate download process
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Create download link
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.fileName;
      link.click();
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="card animate-scale-in" style={{ maxWidth: '400px', width: '100%' }}>
      <div className="text-center space-y-4">
        <div className="file-icon-area bg-gradient-to-br from-emerald-100 to-emerald-200 animate-bounce">
          <Download size={40} className="text-emerald-600" />
        </div>
        
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            <span className="text-emerald-600">✓</span> File Diterima!
          </h3>
        </div>
        
        <div className="space-y-3">
          {file.thumbnail ? (
            <img 
              src={file.thumbnail} 
              alt="preview" 
              className="file-preview mx-auto"
            />
          ) : (
            <div className="file-icon-area bg-gray-100 mx-auto">
              {getFileIcon(file.type)}
            </div>
          )}
          
          <div>
            <p className="font-semibold text-gray-800 break-words px-4">
              {file.fileName}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {formatFileSize(file.size)}
            </p>
          </div>
        </div>
        
        <div className="flex gap-3 justify-center pt-4">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="btn btn-primary"
          >
            {isDownloading ? (
              <>
                <LoadingSpinner size={16} />
                Mengunduh...
              </>
            ) : (
              <>
                <Download size={20} />
                Unduh File
              </>
            )}
          </button>
          
          <button
            onClick={onDismiss}
            className="btn btn-outline"
          >
            <X size={16} />
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

// === MAIN COMPONENTS ===
const ConnectedRoom = ({ room }) => {
  const [uploadStatus, setUploadStatus] = useState('');
  const [incomingFile, setIncomingFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState({ message: '', type: 'info', visible: false });

  const showToast = (message, type = 'info') => {
    setToast({ message, type, visible: true });
  };

  const handleUpload = useCallback(async (file) => {
    if (!file) return;
    
    if (file.size > 100 * 1024 * 1024) {
      showToast('File terlalu besar. Maksimum 100MB.', 'error');
      return;
    }

    setIsUploading(true);
    setUploadStatus(`Mengupload ${file.name}...`);
    setIncomingFile(null);
    setUploadProgress(0);

    try {
      const thumbnail = await createThumbnail(file);
      
      // Simulate progressive upload
      const progressSteps = [10, 25, 45, 70, 85, 95, 100];
      for (let i = 0; i < progressSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 300));
        setUploadProgress(progressSteps[i]);
      }

      // Simulate successful transfer
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setIncomingFile({
        fileName: file.name,
        url: URL.createObjectURL(file),
        thumbnail,
        type: file.type,
        size: file.size
      });
      
      setUploadStatus('File berhasil dikirim!');
      showToast(`${file.name} berhasil dikirim!`, 'success');
      
      setTimeout(() => {
        setUploadProgress(0);
        setUploadStatus('');
      }, 3000);

    } catch (error) {
      setUploadStatus('Gagal mengupload file');
      showToast('Gagal mengupload file', 'error');
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  }, []);

  return (
    <div className="app-container">
      <ConnectionStatus isConnected={true} />
      
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">
            <CheckCircle size={48} className="inline mr-4 text-emerald-500" />
            Terhubung!
          </h1>
          <p className="page-subtitle">
            Ruang: <span className="font-bold text-teal-600">{room.room_code}</span>
          </p>
        </div>
        
        {incomingFile ? (
          <FileDownloadCard 
            file={incomingFile} 
            onDismiss={() => setIncomingFile(null)} 
          />
        ) : (
          <FileUploadArea 
            onFileUpload={handleUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
          />
        )}
        
        {uploadStatus && (
          <div className="success-message animate-slide-in mt-6">
            <Info size={20} />
            <span>{uploadStatus}</span>
          </div>
        )}
      </div>
      
      <Toast 
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
};

const WaitingRoom = ({ room, onCancel }) => {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [roomUrl] = useState(`${typeof window !== 'undefined' ? window.location.origin : ''}?room=${room.room_code}`);

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Simulate connection after 5 seconds for demo
  useEffect(() => {
    const timer = setTimeout(() => {
      if (room.status === 'waiting') {
        // This would normally be handled by the real-time subscription
        room.status = 'connected';
        window.location.reload(); // Simple demo refresh
      }
    }, 8000);
    
    return () => clearTimeout(timer);
  }, [room]);

  return (
    <div className="app-container">
      <ConnectionStatus isConnected={true} />
      
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">
            <Share2 size={48} className="inline mr-4 text-amber-500" />
            Ruang Dibuat!
          </h1>
          <p className="page-subtitle">
            Bagikan kode atau scan QR untuk terhubung
          </p>
        </div>
        
        <div className="text-center space-y-6">
          <QRCodeDisplay value={roomUrl} />
          
          <div className="room-code-display">
            <button
              onClick={() => handleCopy(room.room_code)}
              className="room-code"
            >
              {room.room_code}
            </button>
            
            <div className={`copy-feedback ${copyFeedback ? 'show' : ''}`}>
              <Check size={16} className="inline mr-1" />
              Tersalin!
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 text-gray-600">
              <div className="animate-pulse w-2 h-2 bg-amber-400 rounded-full"></div>
              <span>Menunggu teman untuk bergabung...</span>
            </div>
            
            <p className="text-sm text-gray-500">
              Ruang akan otomatis terhubung saat ada yang bergabung
            </p>
            
            <button
              onClick={onCancel}
              className="btn btn-outline"
            >
              <X size={16} />
              Batalkan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// === MAIN APP COMPONENT ===
export default function LajuApp() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'info', visible: false });

  const [clientId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = sessionStorage.getItem('clientId');
      if (!id) {
        id = Math.random().toString(36).substring(2, 10);
        sessionStorage.setItem('clientId', id);
      }
      return id;
    }
    return 'demo-client';
  });

  const { room, createRoom, joinRoom, cancelRoom } = useRoomManagement(clientId);

  const showToast = (message, type = 'info') => {
    setToast({ message, type, visible: true });
  };

  const handleAction = async (action, param) => {
    setIsLoading(true);
    setError('');
    
    try {
      const result = await action(param);
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
      } else {
        const successMsg = param ? 'Berhasil bergabung ke ruang!' : 'Ruang berhasil dibuat!';
        showToast(successMsg, 'success');
      }
    } catch (error) {
      const errorMsg = 'Terjadi kesalahan. Silakan coba lagi.';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (joinCode.trim()) {
      handleAction(joinRoom, joinCode.trim());
    }
  };

  // Handle room states
  if (room?.status === 'connected') {
    return <ConnectedRoom room={room} />;
  }

  if (room?.host_id === clientId && room?.status === 'waiting') {
    return <WaitingRoom room={room} onCancel={cancelRoom} />;
  }

  // Main landing page
  return (
    <div className="app-container">
      <div className="main-content">
        <div className="page-header">
          <h1 className="page-title">
            Laju.io
          </h1>
          <p className="page-subtitle">
            Transfer file super cepat tanpa ribet. Langsung antar perangkat, aman dan mudah.
          </p>
        </div>

        <div className="action-grid">
          {/* Join Room Card */}
          <div className="card action-card join-card animate-slide-in">
            <div className="card-icon">
              <Share2 size={32} />
            </div>
            
            <h2 className="card-title">Gabung Ruang</h2>
            <p className="card-description">
              Masukkan kode ruang untuk bergabung
            </p>
            
            <div className="form-group">
              <input
                type="text"
                maxLength={4}
                className="input-field code-input"
                placeholder="KODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                disabled={isLoading}
              />
              
              <button
                onClick={handleJoinSubmit}
                disabled={isLoading || !joinCode.trim()}
                className="btn btn-primary btn-large"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size={20} />
                    Bergabung...
                  </>
                ) : (
                  <>
                    <Share2 size={20} />
                    Gabung Ruang
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Create Room Card */}
          <div className="card action-card create-card animate-slide-in" style={{animationDelay: '0.1s'}}>
            <div className="card-icon">
              <Upload size={32} />
            </div>
            
            <h2 className="card-title">Buat Ruang Baru</h2>
            <p className="card-description">
              Mulai transfer file dengan membuat ruang baru
            </p>
            
            <div className="form-group">
              <button
                onClick={() => handleAction(createRoom)}
                disabled={isLoading}
                className="btn btn-secondary btn-large"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size={20} />
                    Membuat...
                  </>
                ) : (
                  <>
                    <Upload size={20} />
                    Buat Ruang
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message animate-slide-in">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}
      </div>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Laju.io - Dibuat dengan ❤️ untuk kemudahan transfer file.</p>
      </footer>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </div>
  );
}