module.exports = {
  apps: [
    {
      name: 'roya-smart-card',
      script: 'dist/server.cjs',
      cwd: '/var/www/roya-card',
      // حتماً ۱ بماند: دیتابیس فایلی است و چند پروسه همزمان داده‌ها را خراب می‌کنند.
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // ADMIN_PASSWORD و SESSION_SECRET از فایل /var/www/roya-card/.env خوانده می‌شوند.
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/roya-card/error.log',
      out_file: '/var/log/roya-card/access.log',
      merge_logs: true,
    },
  ],
};
