# Infrastructure & Deployment Strategy

This document describes the **infrastructure, deployment model, and operational decisions** for the Online Library project.

The goal is to provide a **simple, reliable, and maintainable setup** that supports SEO-first content delivery and allows future growth **without premature complexity**.

---

## 1. Guiding Principles

- **SEO-first**: real HTML pages, indexable by search engines
- **Self-hosted**: no mandatory cloud providers
- **Simple MVP first**: avoid premature microservices and orchestration
- **Containers are ephemeral, data is persistent**
- **Operational clarity over theoretical scalability**

---

## 2. Hosting Model (Phase 1)

### Current Approach
- Single physical machine (home-hosted)
- Ubuntu Linux
- Acts as:
  - application server
  - background worker
  - database host

This model is sufficient for:
- early traffic
- content-focused workloads
- low to moderate concurrency

A dedicated server or cloud migration will be considered **only when real scaling pressure appears** (traffic, uptime, or operational risk).

---

## 3. Container Runtime

### Chosen Stack
- **Docker Engine (native Linux)**
- **Docker Compose (v2 plugin)**

### Why Docker Engine + Docker Compose
- Native Linux runtime (no virtualization layer)
- Stable and predictable behavior
- Automatic startup via `systemd`
- Simple orchestration for small to medium stacks
- Clear upgrade path to more advanced orchestration if needed

### Explicitly Not Used
- ❌ Docker Desktop (development-focused, unnecessary on Linux servers)
- ❌ Kubernetes (overkill for a single-node MVP)

---

## 4. Service Architecture

All services are managed via a single `docker-compose.yml`.

### Core Services
- **PostgreSQL**
  - Stores metadata, chapters, reading progress, notes
  - Uses persistent volumes
- **API (ASP.NET Core)**
  - Serves application logic and APIs
  - Stateless
- **Worker (ASP.NET Core Worker)**
  - Handles book ingestion and background processing
  - Stateless
- **Web**
  - SEO-friendly HTML or static frontend
  - No server-side session state
- **Reverse Proxy**
  - Single public entry point (ports 80/443)
  - Routes traffic to internal services

---

## 5. Reverse Proxy

### Purpose
The reverse proxy acts as the **edge layer** of the system.

Responsibilities:
- HTTPS termination
- Request routing (`/` → web, `/api` → API)
- Security headers
- Compression (gzip/brotli)
- Optional static asset caching

### Chosen Approach
- Nginx or Caddy (implementation detail)
- Exactly one public entry point
- No application logic inside the proxy

### Why a Reverse Proxy Is Required
- Clean URLs (no exposed ports)
- Centralized TLS configuration
- Better SEO control
- Improved security and observability

---

## 6. Data & Storage Strategy

### Persistent Data
- PostgreSQL data
- Uploaded book files
- Derived assets (covers, cached HTML)

### Storage Model
- Data stored on the **host filesystem**
- Containers use **bind mounts**
- Containers can be destroyed and recreated safely

Example paths: