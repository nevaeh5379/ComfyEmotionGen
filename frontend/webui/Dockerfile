FROM node:22-alpine AS build
WORKDIR /app

ARG CEG_BUNDLE_VERSION=dev
ARG CEG_COMMIT=
ENV CEG_BUNDLE_VERSION=${CEG_BUNDLE_VERSION} \
    CEG_COMMIT=${CEG_COMMIT}

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build


FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-write-config.sh
RUN chmod +x /docker-entrypoint.d/40-write-config.sh

EXPOSE 80
