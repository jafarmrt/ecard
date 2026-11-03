# ==============================================================================
# Dockerfile اختصاصی برای اجرای بهینه و سبک سامانه کارت ویزیت هوشمند رویا
# ==============================================================================

# مرحله اول: بیلد و کامپایل فرانت‌اند و بک‌اند
FROM node:22.13-alpine AS builder

WORKDIR /app

# ابزار کامپایل (python/make/g++) لازم نیست: هیچ وابستگی بومی کامپایل نمی‌شود و sharp باینری آماده دارد.

COPY package*.json ./
RUN npm ci

COPY . .

# تولید فایل‌های PWA و کامپایل پروژه به dist/
RUN npm run build

# ------------------------------------------------------------------------------
# مرحله دوم: ایمیج نهایی بسیار سبک جهت اجرا در محیط عملیاتی (Production)
# ------------------------------------------------------------------------------
FROM node:22.13-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# فقط پکیج‌های لازم برای اجرا (express، sharp برای تصاویر، فونت وزیرمتن برای تصویر پیش‌نمایش)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# کپی خروجی کامپایل شده از مرحله قبل
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
# داده واقعی در ایمیج نیست؛ پوشه data و uploads از volume می‌آیند (docker-compose.yml).
# اگر data/database.json نسخه قبلی را در volume بگذارید، در اولین اجرا خودکار به SQLite منتقل می‌شود.
RUN mkdir -p /app/public/uploads /app/data/backups && chown -R node:node /app
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# کانتینر با root شروع می‌شود فقط برای اصلاح مالکیت دیسک‌های mount شده،
# سپس برنامه با کاربر node (بدون دسترسی root) اجرا می‌شود.
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.cjs"]
