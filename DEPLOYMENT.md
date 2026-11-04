# Appointment Management Application — Production Deployment Guide

## Overview

The **Appointment Management Application** is an independent Next.js 15 logistics application operating on the domain:
`https://appointment.averretail.com`

It connects directly to the shared Consignment PostgreSQL database as the single source of truth for orders, tracking, and courier appointments.

---

## 1. Architecture Summary

```
                 Existing PostgreSQL
                 Consignment Database
                          │
             ┌────────────┴────────────┐
             │                         │
     Main Consignment          Appointment App
        Application         appointment.averretail.com
       (Port 3000)                 (Port 3001)
```

- **Shared Database:** Both applications read and update the same `ConsignmentOrder` records.
- **Dedicated Port:** 3001 (isolated from Consignment on port 3000).
- **Access Scope:** Strictly restricted to Administrators and Iqbal (Logistics Manager).

---

## 2. DNS Configuration

Add the following DNS record in your DNS provider (Cloudflare, GoDaddy, Route53, etc.) for `averretail.com`:

| Type | Name / Host | Target / Value | TTL | Proxy Status |
|---|---|---|---|---|
| **A** | `appointment` | `<VPS_PUBLIC_IP>` | Auto / 300s | DNS Only (or Proxied) |

*Example:*
- Subdomain: `appointment.averretail.com`
- Points to: VPS IP address running Coolify

---

## 3. Coolify Application Setup

1. In Coolify, navigate to **Projects** ➔ Select your project environment (e.g. `Production`).
2. Click **+ New Resource** ➔ **Public / Private Repository**.
3. Repository URL: `https://github.com/Sigmabysoul/appointment`
4. Branch: `main`
5. Build Pack: **Docker Compose** (or **Dockerfile**).
6. Under **Domains / FQDN**:
   `https://appointment.averretail.com`
7. Enable **SSL / HTTPS Certificate** (Let's Encrypt managed automatically by Coolify/Traefik).
8. Under **Healthcheck**:
   - Path: `/api/health`
   - Port: `3001`

---

## 4. Environment Variables Checklist

Configure these variables in Coolify's Environment Variables tab:

```env
# Shared Consignment Database Connection
DATABASE_URL=postgresql://postgres:postgres@<DB_HOST>:5432/consignment?schema=public

# Authentication secret (shared JWT key with Consignment ecosystem)
AUTH_SECRET=consignment_super_secret_jwt_key_2026_production_safe_token
JWT_SECRET=consignment_super_secret_jwt_key_2026_production_safe_token

# Application URL
APP_URL=https://appointment.averretail.com
PORT=3001
NODE_ENV=production
```

> **Security Note:** Never commit production credentials to git. Set them strictly in the Coolify environment settings.

---

## 5. Deployment Verification Checklist

Once deployed, verify:

1. **Health Check:**
   `curl https://appointment.averretail.com/api/health`
   Returns: `{"status":"ok","app":"appointment","database":"connected"}`
2. **Access Control:**
   - Log in as `admin`: Full access granted.
   - Log in as `dispatch` (Iqbal): Logistics access granted.
   - Attempt login with `printing` or `manir`: Rejected with `403 Forbidden`.
   - Attempt direct API call without token: Rejected with `401 Unauthorized`.
3. **Data Synchronization:**
   - Update AWB / Tracking ID on an order in Appointment.
   - Inspect the same order in ConsignmentOps: updated tracking ID is visible immediately.
   - Verify GRN status and main order status remain intact.

---

## 6. Rollback Procedure

If any issue arises:

1. **In Coolify:** Go to **Deployments** ➔ Click on the previous successful deployment ➔ Click **Redeploy**.
2. **Database Integrity:** No migrations were run on the shared database tables. The schema remains 100% backwards-compatible with the main Consignment application.
