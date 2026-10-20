import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (showReconnected) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-2xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xl animate-in fade-in slide-in-from-bottom duration-200 border border-emerald-400/30">
        <Wifi className="h-4 w-4 text-emerald-200" />
        <span>اتصال مجدد برقرار شد (همگام‌سازی آنلاین)</span>
      </div>
    );
  }

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-2xl bg-amber-600/95 px-3.5 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom duration-200 border border-amber-400/30">
      <WifiOff className="h-4 w-4 text-amber-200 animate-pulse" />
      <span>حالت آفلاین — اطلاعات کارت از حافظه موقت لود شد</span>
    </div>
  );
};
