# ==============================================================================
# Dockerfile اختصاصی برای اجرای بهینه و سبک سامانه کارت ویزیت هوشمند رویا
# ==============================================================================

# مرحله اول: بیلد و کامپایل فرانت‌اند و بک‌اند
FROM node:22-alpine AS builder

WORKDIR /app

# نصب ابزارهای مورد نیاز کامپایل
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

# تولید فایل‌های PWA و کامپایل پروژه به dist/
RUN npm run build

# ------------------------------------------------------------------------------
# مرحله دوم: ایمیج نهایی بسیار سبک جهت اجرا در محیط عملیاتی (Production)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# نصب پکیج‌های runtime فقط
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# کپی خروجی کامپایل شده از مرحله قبل
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data

# ایجاد پوشه آپلود و دسترسی‌های لازم
RUN mkdir -p /app/public/uploads /app/data && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
