import React, { useState } from 'react';
import { 
  Server, 
  Copy, 
  Check, 
  Terminal, 
  FileCode, 
  ShieldCheck, 
  Cpu, 
  HardDrive, 
  X,
  ExternalLink,
  BookOpen,
  Database
} from 'lucide-react';
import { copyToClipboard as universalCopy } from '../utils/clipboard';

interface ServerDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerDeployModal: React.FC<ServerDeployModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'nginx' | 'pm2' | 'systemd' | 'docker' | 'guide'>('nginx');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = async (text: string, key: string) => {
    const ok = await universalCopy(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  const nginxCode = `# پیکربندی Nginx برای دامنه کارت هوشمند رویا
server {
    listen 80;
    server_name card.royainterior.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name card.royainterior.com;

    ssl_certificate /etc/letsencrypt/live/card.royainterior.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/card.royainterior.com/privkey.pem;

    client_max_body_size 25M;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;

  const pm2Code = `# اجرای سرویس با PM2
npm install -g pm2
npm run build
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup`;

  const systemdCode = `[Unit]
Description=Roya Smart NFC Business Card Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/roya-card
ExecStart=/usr/bin/node dist/server.cjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=ADMIN_PASSWORD=roya1403

[Install]
WantedBy=multi-user.target`;

  const dockerCode = `# اجرای سریع با Docker Compose
cd deploy
docker compose up -d --build`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>فاز ۴: پکیج استقرار سرور اختصاصی رویا</span>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-mono">
                  Production Ready
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                فایل‌های کانفیگ آماده Nginx، PM2، Systemd و Docker برای اجرا روی سرور لینوکس شرکت
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-2 bg-slate-950/70 border-b border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('nginx')}
            className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'nginx'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Nginx Reverse Proxy & SSL</span>
          </button>

          <button
            onClick={() => setActiveTab('pm2')}
            className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'pm2'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>PM2 Process Manager</span>
          </button>

          <button
            onClick={() => setActiveTab('systemd')}
            className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'systemd'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>سرویس لینوکس (Systemd)</span>
          </button>

          <button
            onClick={() => setActiveTab('docker')}
            className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'docker'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>داکر (Docker)</span>
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'guide'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>راهنمای گام‌به‌گام</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'nginx' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-mono text-amber-400">/etc/nginx/sites-available/roya-card.conf</span>
                <button
                  onClick={() => copyToClipboard(nginxCode, 'nginx')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs cursor-pointer"
                >
                  {copiedKey === 'nginx' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'nginx' ? 'کپی شد!' : 'کپی کانفیگ Nginx'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed" dir="ltr">
                {nginxCode}
              </pre>
              <div className="p-3 bg-slate-800/60 rounded-2xl border border-slate-700/60 text-xs text-slate-300">
                <span className="font-bold text-amber-400">نکته SSL:</span> پس از قرار دادن این فایل، کافیست دستور <code className="text-amber-300 bg-slate-900 px-1.5 py-0.5 rounded font-mono">sudo certbot --nginx -d card.royainterior.com</code> را اجرا کنید تا گواهی امنیتی HTTPS خودکار نصب گردد.
              </div>
            </div>
          )}

          {activeTab === 'pm2' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-mono text-amber-400">deploy/ecosystem.config.cjs</span>
                <button
                  onClick={() => copyToClipboard(pm2Code, 'pm2')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs cursor-pointer"
                >
                  {copiedKey === 'pm2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'pm2' ? 'کپی شد!' : 'کپی دستورات PM2'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-mono text-amber-300 overflow-x-auto leading-relaxed" dir="ltr">
                {pm2Code}
              </pre>
              <p className="text-xs text-slate-400">
                ابزار PM2 برنامه را به صورت نامحسوس در پس‌زمینه لینوکس زنده نگه داشته و در صورت هرگونه ریبوت یا خطای غیرمنتظره، آن را در کسری از ثانیه ری‌استارت می‌کند.
              </p>
            </div>
          )}

          {activeTab === 'systemd' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-mono text-amber-400">/etc/systemd/system/roya-card.service</span>
                <button
                  onClick={() => copyToClipboard(systemdCode, 'systemd')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs cursor-pointer"
                >
                  {copiedKey === 'systemd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'systemd' ? 'کپی شد!' : 'کپی سرویس Systemd'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-mono text-sky-400 overflow-x-auto leading-relaxed" dir="ltr">
                {systemdCode}
              </pre>
            </div>
          )}

          {activeTab === 'docker' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-mono text-amber-400">deploy/docker-compose.yml</span>
                <button
                  onClick={() => copyToClipboard(dockerCode, 'docker')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs cursor-pointer"
                >
                  {copiedKey === 'docker' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'docker' ? 'کپی شد!' : 'کپی دستورات داکر'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-mono text-purple-400 overflow-x-auto leading-relaxed" dir="ltr">
                {dockerCode}
              </pre>
              <p className="text-xs text-slate-400">
                ایمیج داکر بر پایه Node 22 Alpine با حجم بسیار فشرده و تفکیک حجم‌های پایگاه داده (<code className="text-slate-300">/app/data</code>) جهت ماندگاری دائمی تنظیم شده است.
              </p>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 space-y-2">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  مراحل اجرای سریع در ترمینال سرور:
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pr-1">
                  <li>پوشه پروژه را در مسیر <code className="text-amber-300 font-mono">/var/www/roya-card</code> قرار دهید.</li>
                  <li>دستور <code className="text-amber-300 font-mono">npm install && npm run build</code> را اجرا کنید.</li>
                  <li>سرویس را با دستور <code className="text-amber-300 font-mono">pm2 start deploy/ecosystem.config.cjs</code> بالا بیاورید.</li>
                  <li>کانفیگ Nginx را کپی و با Certbot اس اس ال رایگان بگیرید.</li>
                </ol>
              </div>

              <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="font-bold text-white text-xs">اسکریپت بک‌آپ خودکار روزانه</div>
                    <div className="text-[11px] text-slate-400">فایل <code className="font-mono text-slate-300">deploy/backup-cron.sh</code> را در Crontab سرور قرار دهید.</div>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard('0 3 * * * /var/www/roya-card/deploy/backup-cron.sh >> /var/log/roya-backup.log 2>&1', 'cron')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedKey === 'cron' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>کپی دستور Cron</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>تمام فایل‌ها در پوشه <code className="text-amber-400 font-mono">/deploy</code> پروژه ذخیره شده‌اند.</span>
          </div>
          <button
            onClick={onClose}
            className="py-2 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs transition-colors cursor-pointer"
          >
            بستن پنجره
          </button>
        </div>

      </div>
    </div>
  );
};
