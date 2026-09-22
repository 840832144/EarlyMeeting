FROM node:24.20.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates util-linux \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY tools/callback-test/package.json tools/callback-test/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY tools/callback-test/*.cjs ./
COPY deploy/linux/entrypoint.sh /usr/local/bin/earlymeeting
RUN chmod 755 /usr/local/bin/earlymeeting
ENV NODE_ENV=production TZ=Asia/Shanghai \
    EARLYMEETING_CONFIG_DIR=/config EARLYMEETING_DATA_DIR=/data EARLYMEETING_FILE_LOG=0
USER 1000:1000
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/earlymeeting"]
CMD ["node", "meeting.cjs"]
