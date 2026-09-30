# syntax=docker/dockerfile:1.7

ARG NGINX_IMAGE=nginx:1.31.5-alpine3.24@sha256:34f40471dea485273c5e2a04dd5e97a682332ceb4a9adecd67de450dcb2fb390

FROM ${NGINX_IMAGE}

RUN rm -f /etc/nginx/conf.d/default.conf
COPY ui/nginx.conf /etc/nginx/nginx.conf

EXPOSE 4000/tcp
