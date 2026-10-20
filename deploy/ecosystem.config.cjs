module.exports = {
  apps: [
    {
      name: 'roya-smart-card',
      script: 'dist/server.cjs',
      cwd: '/var/www/roya-card',
      instances: 1, // یا 'max' برای تقسیم بار پردازشی چند هسته‌ای
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        ADMIN_PASSWORD: 'roya1403',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/roya-card/error.log',
      out_file: '/var/log/roya-card/access.log',
      merge_logs: true,
    },
  ],
};
