FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

COPY Directory.Build.props Directory.Packages.props ./
COPY backend/src/Api/Api.csproj backend/src/Api/
COPY backend/src/Worker/Worker.csproj backend/src/Worker/
COPY backend/src/Infrastructure/Infrastructure.csproj backend/src/Infrastructure/
COPY backend/src/Domain/Domain.csproj backend/src/Domain/
COPY backend/src/Contracts/Contracts.csproj backend/src/Contracts/
COPY backend/src/Application/Application.csproj backend/src/Application/
COPY backend/src/Search/TextStack.Search/TextStack.Search.csproj backend/src/Search/TextStack.Search/
COPY backend/src/Search/TextStack.Search.Meilisearch/TextStack.Search.Meilisearch.csproj backend/src/Search/TextStack.Search.Meilisearch/
COPY backend/src/Extraction/TextStack.Extraction/TextStack.Extraction.csproj backend/src/Extraction/TextStack.Extraction/
RUN dotnet restore backend/src/Worker/Worker.csproj

COPY backend/src/ backend/src/
RUN dotnet publish backend/src/Worker/Worker.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

# Install Node.js, fonts, and Chromium dependencies for SSG prerender.
# Retry the whole sequence up to 5× to ride out transient archive.ubuntu.com
# flakiness in CI (apt update + install can fail mid-fetch; `--fix-missing`
# resumes partial fetches on retry).
RUN set -eux; \
    for i in 1 2 3 4 5; do \
        apt-get update && apt-get install -y --no-install-recommends --fix-missing \
            fontconfig \
            libfreetype6 \
            fonts-dejavu-core \
            libfontconfig1 \
            libgl1 \
            libice6 \
            libsm6 \
            libx11-6 \
            libxext6 \
            libxrender1 \
            nodejs \
            npm \
            ca-certificates \
            libnss3 \
            libatk1.0-0 \
            libatk-bridge2.0-0 \
            libcups2 \
            libdrm2 \
            libxkbcommon0 \
            libxcomposite1 \
            libxdamage1 \
            libxrandr2 \
            libgbm1 \
            libasound2t64 \
            libxfixes3 \
            libxcursor1 \
            libxi6 \
            libxtst6 \
            libpango-1.0-0 \
            libpangocairo-1.0-0 \
            libcairo2 \
        && break || { echo "apt attempt $i failed — retrying in 15s"; sleep 15; }; \
    done; \
    rm -rf /var/lib/apt/lists/*; \
    fc-cache -fv

# Puppeteer cache location (scripts mounted via docker-compose volume)
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

RUN userdel -r app 2>/dev/null; userdel -r ubuntu 2>/dev/null; \
    groupadd -g 1000 app && useradd -u 1000 -g app -m app

RUN mkdir -p /storage/users && chown -R app:app /storage
WORKDIR /app
COPY --from=build /app/publish .

# Install puppeteer for SSG prerender (scripts mounted at /app/apps/web/scripts).
# Drop --silent so the next failure surfaces the actual npm/postinstall error
# instead of hiding it behind a bare exit code 1 — deploy CI started failing on
# this line after working all week and the silent flag swallows the cause.
# Retry loop covers Chromium-download flakiness (puppeteer's postinstall pulls
# ~150 MB from googleapis.com).
RUN mkdir -p /app/apps/web && \
    cd /app/apps/web && \
    npm init -y && \
    for i in 1 2 3; do \
        npm install puppeteer && break || \
        { echo "puppeteer install attempt $i failed, retrying..." >&2; sleep 5; }; \
    done && \
    test -d node_modules/puppeteer && \
    chown -R app:app /app

USER app
ENTRYPOINT ["dotnet", "Worker.dll"]
