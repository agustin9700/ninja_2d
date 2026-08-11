FROM node:22-alpine

WORKDIR /app
COPY ninja_runner ./ninja_runner

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "ninja_runner/server.js"]
