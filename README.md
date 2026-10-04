<div align="center">

<img src="frontend/public/urban_nest-logo.png" alt="UrbanNest logo" height="90" />

# UrbanNest Secure

**A property rental platform built around a hand-written cryptographic core.**

Owners list properties, tenants book and review them, and every piece of personal data is encrypted before it reaches the database. RSA, ECC, SHA-512 and CBC-MAC are written from scratch with JavaScript `BigInt` arithmetic.

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%209-47A248?logo=mongodb&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
[![CodeQL](https://github.com/UtshaBasak/UrbanNest_Secure/actions/workflows/codeql.yml/badge.svg)](https://github.com/UtshaBasak/UrbanNest_Secure/actions/workflows/codeql.yml)

</div>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Security architecture](#security-architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [API overview](#api-overview)
- [Roles and permissions](#roles-and-permissions)
- [Deployment](#deployment)
- [Security notes and limitations](#security-notes-and-limitations)
- [Author](#author)

---

## Overview

UrbanNest Secure is a full-stack MERN application for renting residential property. It began as a lab project for a Security Architecture and Cryptography course. The rule was **no plaintext storage**: names, e-mail addresses, phone numbers and property details are encrypted at rest, and the primitives that protect them are implemented in the repository instead of imported from a crypto library.

## Features

### For tenants

- Search and filter listings, compare properties side by side, and save favourites
- Request bookings and track their status
- Review properties and rate owners
- Submit leave (move-out) requests
- Chat with owners. Messages are encrypted at rest with ECIES.

### For owners

- Create, edit and remove property listings
- Approve or reject booking requests
- Respond to leave requests and rate tenants
- Owner dashboard with listings, bookings and reviews in one place

### For administrators

- Platform statistics dashboard
- Manage owners, tenants, properties and reviews
- Activate, deactivate or remove accounts

### Across the platform

- E-mail OTP verification for sign-up, password reset and e-mail changes
- Optional e-mail two-factor authentication on login
- In-app notifications, light and dark themes, and a responsive UI

## Security architecture

All primitives live in [`backend/crypto/`](backend/crypto) and are implemented by hand.

| Module | Purpose |
| :--- | :--- |
| [`rsa.js`](backend/crypto/rsa.js) | RSA key generation (Miller–Rabin primality testing), encryption and decryption, and deterministic fingerprints for encrypted look-ups |
| [`ecc.js`](backend/crypto/ecc.js) | secp256k1 elliptic-curve arithmetic, key pairs and ECDH shared secrets |
| [`eccMessageCrypto.js`](backend/crypto/eccMessageCrypto.js) | ECIES for chat: ephemeral ECDH + SHA-512 KDF + AES-256-GCM |
| [`sha512.js`](backend/crypto/sha512.js) | SHA-512 hash and random salt generation |
| [`cbc_mac.js`](backend/crypto/cbc_mac.js) | CBC-MAC built on SHA-512 for integrity checks |
| [`sessionToken.js`](backend/crypto/sessionToken.js) | Session tokens: payload + CBC-MAC tag + RSA-wrapped per-session key |
| [`keyManager.js`](backend/crypto/keyManager.js) | Key generation, persistence, caching and rotation, with private keys protected by an ECC-derived key |

### How the pieces fit together

1. **Encryption at rest.** Mongoose `pre('save')` hooks RSA-encrypt PII before a document is written. A `post('save')` hook then `$unset`s any plaintext fields, so only ciphertext stays in MongoDB.
2. **Look-ups without plaintext.** An e-mail address is never stored in the clear. Users are found through a deterministic RSA **fingerprint** of the lower-cased address.
3. **Password storage.** Passwords are salted with a random 16-byte salt and hashed with SHA-512.
4. **Session management.** Access tokens (15 min) and refresh tokens (24 h) are issued as `HttpOnly`, `SameSite` cookies (`Secure` in production). Each token carries a CBC-MAC tag keyed by a fresh session key, and that key is RSA-encrypted inside the token. Tokens are bound to the client IP (enforced in production) and are added to a blocklist on logout.
5. **Account protection.** Accounts lock after 5 failed logins, OTPs expire after 10 minutes and are stored only as hashes, passwords expire after 90 days, and auth endpoints are rate-limited.
6. **Transport hardening.** Helmet security headers, a CORS allow-list, request validation with `express-validator`, and HTTPS redirection in production.
7. **Key separation.** Separate key pairs are used for user data, OTPs and sessions, and each can be rotated independently.

## Tech stack

| Layer | Technology |
| :--- | :--- |
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS 4, Lucide icons |
| Backend | Node.js (ES modules), Express 5, Helmet, express-rate-limit, express-validator, Nodemailer |
| Database | MongoDB with Mongoose 9 |
| Cryptography | From-scratch RSA, secp256k1 ECC, SHA-512 and CBC-MAC (`BigInt`) |
| Tooling | ESLint 10, Nodemon, Concurrently, GitHub CodeQL, Dependabot |

## Project structure

```text
UrbanNest_Secure/
├── .github/
│   ├── dependabot.yml          # Weekly dependency updates (npm + Actions)
│   └── workflows/codeql.yml    # CodeQL security scanning
├── backend/
│   ├── config/                 # Env loader, MongoDB connection, e-mail service
│   ├── controllers/            # Route handlers (auth, properties, bookings, chat, ...)
│   ├── crypto/                 # Hand-written cryptographic core
│   ├── middleware/             # Authentication and role-based access control
│   ├── models/                 # Mongoose schemas with encryption hooks
│   ├── routes/                 # Express routers mounted under /api
│   ├── scripts/
│   │   ├── createAdmin.js      # Bootstrap the administrator account
│   │   ├── migrations/         # One-off data migrations
│   │   └── maintenance/        # Diagnostic and debugging utilities
│   └── server.js               # Application entry point
├── frontend/
│   ├── public/                 # Static assets (logo, favicon)
│   └── src/
│       ├── components/         # Navbar, route guards, search
│       ├── context/            # Auth and theme providers
│       ├── pages/              # Application views
│       └── utils/              # API client helpers
├── .env.example                # Environment variable template
└── package.json                # Workspace scripts (dev, build, start)
```

## Getting started

### Prerequisites

- **Node.js 22+** and npm
- **MongoDB**, either a local instance or a [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- An **SMTP account** for OTP e-mails. Gmail needs an [App Password](https://support.google.com/accounts/answer/185833).

### 1. Clone the repository

```bash
git clone https://github.com/UtshaBasak/UrbanNest_Secure.git
cd UrbanNest_Secure
```

### 2. Install dependencies

```bash
npm run install:all
```

This installs the root tooling, the backend and the frontend.

### 3. Configure the environment

```bash
cp .env.example .env
```

Then edit `.env` in the **repository root**:

| Variable | Required | Description |
| :--- | :---: | :--- |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `EMAIL_USER` | ✅ | SMTP / Gmail address that sends OTP e-mails |
| `EMAIL_PASS` | ✅ | SMTP password or Gmail App Password |
| `PORT` | | API port (default `5000`) |
| `NODE_ENV` | | `development` or `production` |
| `CLIENT_URL` | | Frontend origin added to the CORS allow-list |
| `ADMIN_EMAIL` | | Admin account e-mail, used by `create-admin` and promoted to admin on login |
| `ADMIN_PASSWORD` | | Initial admin password for `create-admin` |
| `ADMIN_NAME` | | Display name for the admin account |

> Encryption keys are generated automatically on first start and stored in MongoDB. You don't need to create any key files.

### 4. Create an administrator (optional)

```bash
npm run create-admin
```

### 5. Run the app

```bash
npm run dev
```

| Service | URL |
| :--- | :--- |
| Web app | <http://localhost:5173> |
| API | <http://localhost:5000/api> |
| Health check | <http://localhost:5000/api/health> |

The Vite dev server proxies `/api` requests to the backend, so cookies work without extra CORS setup.

## Available scripts

Run from the **repository root**:

| Command | Description |
| :--- | :--- |
| `npm run install:all` | Install root, backend and frontend dependencies |
| `npm run dev` | Start the API and the web app together |
| `npm run dev:backend` / `npm run dev:frontend` | Start one side only |
| `npm run build` | Build the frontend for production (`frontend/dist`) |
| `npm start` | Start the API in production mode |
| `npm run lint` | Lint the frontend |
| `npm run create-admin` | Create or promote the administrator account |

Data migrations, run from `backend/`:

| Command | Description |
| :--- | :--- |
| `npm run migrate:pii` | Encrypt legacy plaintext user PII |
| `npm run migrate:properties` | Encrypt legacy plaintext property data |
| `npm run migrate:property-ids` | Assign public 8-character IDs to properties |
| `npm run migrate:email-index` | Rebuild the unique e-mail fingerprint index |

## API overview

All endpoints are prefixed with `/api`. Protected routes need the session cookie set at login.

| Resource | Base path | Highlights |
| :--- | :--- | :--- |
| Auth | `/auth` | `send-otp`, `verify-otp`, `register`, `login`, `verify-2fa`, `refresh`, `forgot-password`, `reset-password`, `logout`, `me` |
| Users | `/users` | Profiles, search, favourites, e-mail/password change, 2FA toggle, contact visibility |
| Properties | `/properties` | CRUD, top-rated, suggested, by owner, look-up by public ID |
| Bookings | `/bookings` | Create, list own, approve/reject, cancel |
| Reviews | `/reviews` | Property reviews with eligibility checks |
| Ratings | `/ratings` | Owner ↔ tenant ratings and summaries |
| Leave requests | `/leave-requests` | Tenant move-out requests and owner decisions |
| Chat | `/chat` | Conversations and ECIES-encrypted messages |
| Notifications | `/notifications` | List, mark read/unread, delete |
| Admin | `/admin` | Stats and moderation of users, properties and reviews |

## Roles and permissions

| Role | Permissions |
| :--- | :--- |
| **Admin** | Full platform oversight: statistics, user management, and moderation of listings and reviews |
| **Owner** | Create and manage listings, handle bookings and leave requests, rate tenants |
| **Tenant** | Browse and compare listings, book properties, write reviews, rate owners, request leave |

Roles are enforced on the server by the `authorize(...)` middleware in [`backend/middleware/auth.js`](backend/middleware/auth.js). Route guards in the frontend only control what the UI shows.

## Deployment

In production the Express server also serves the built frontend:

```bash
npm run install:all
npm run build
NODE_ENV=production npm start
```

When `NODE_ENV=production`:

- cookies are `Secure` and `SameSite=Strict`
- HTTP requests are redirected to HTTPS (behind a proxy that sets `x-forwarded-proto`)
- requests from origins outside the CORS allow-list are rejected

## Security notes and limitations

This project is for learning, and the trade-offs are documented on purpose:

- **Hand-rolled cryptography is not production-grade.** The implementations show how the algorithms work, but they have not been audited and are not constant-time. A real deployment should use vetted libraries such as Node's `crypto` module or libsodium.
- **RSA keys are 512-bit by default** so key generation in pure `BigInt` stays fast. That size is far below modern recommendations (≥ 2048-bit). The size is set in `initializeAllKeys()` in [`keyManager.js`](backend/crypto/keyManager.js).
- **Chat uses AES-256-GCM from Node's built-in `crypto`** as the symmetric cipher inside ECIES. Key agreement and key derivation are still the from-scratch ECC and SHA-512.
- **Passwords use one round of salted SHA-512.** That's fine for the exercise, but production systems should use a slow, memory-hard KDF such as Argon2id, scrypt or bcrypt.

If you find a security issue, please open an issue or contact the maintainer privately.

## Author

**Utsha Basak**: [@UtshaBasak](https://github.com/UtshaBasak)

Developed as part of the Security Architecture and Cryptography lab.
