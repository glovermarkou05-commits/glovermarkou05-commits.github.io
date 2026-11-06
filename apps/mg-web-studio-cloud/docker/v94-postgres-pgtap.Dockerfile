# V94B synthetic, GitHub-hosted disposable lab only. Not a service image.
FROM postgres:17.11-bookworm
RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql-17-pgtap; \
    rm -rf /var/lib/apt/lists/*
