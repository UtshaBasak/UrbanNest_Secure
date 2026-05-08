# UrbanNest_Secure 🏠🔒

**UrbanNest_Secure** is a high-security Property Management System designed with a "No Plaintext Storage" policy. The core objective of this project is to implement robust security features—including asymmetric encryption, data integrity checks, and secure session management—**entirely from scratch** without relying on high-level built-in cryptographic libraries (like Node.js `crypto` for core logic).

---

## 🛡️ Security Features

### 1. Custom Cryptographic Engine
The system features a proprietary crypto engine implemented using Javascript `BigInt` arithmetic:
*   **RSA (Asymmetric):** Used for encrypting PII (Name, Email, Phone) and static property data at rest.
*   **ECC (secp256k1):** Implemented for secure message transport and hybrid encryption (ECIES) for data-in-motion.
*   **SHA-512:** A custom implementation of the Secure Hash Algorithm for password salting and integrity.

### 2. No Plaintext Storage Policy
*   All sensitive data is encrypted *before* reaching the database.
*   Plaintext fields are explicitly wiped from memory using Mongoose post-save hooks.
*   Lookups for encrypted fields (like Email) are performed using deterministic **RSA Fingerprints**.

### 3. Data Integrity (CBC-MAC)
Every critical record is protected by a **CBC-MAC (Cipher Block Chaining Message Authentication Code)** built over SHA-512. This ensures that any database-level tampering or bit rot is detected before decryption.

### 4. Secure Session Management
Sessions are managed via a custom **RSA + CBC-MAC Hybrid Token** scheme stored in `HttpOnly`, `Secure` cookies, preventing token theft and replay attacks.

### 5. Multi-Factor Authentication (2FA)
A mandatory second factor (Email OTP) is required for all logins. OTPs are hashed using a custom algorithm before storage.

---

## 🚀 Tech Stack

*   **Frontend:** React.js, TailwindCSS, Vite
*   **Backend:** Node.js, Express.js
*   **Database:** MongoDB (via Mongoose)
*   **Crypto Core:** Vanilla Javascript (BigInt arithmetic)
*   **Authentication:** Custom Hybrid Tokens + RBAC

---

## 📁 Project Structure

```text
├── backend
│   ├── config          # DB and Email service configurations
│   ├── controllers     # API route handlers (Auth, Property, Booking)
│   ├── crypto          # 🔐 CORE CRYPTO LOGIC (RSA, ECC, SHA-512, MAC)
│   ├── middleware      # Auth and RBAC enforcement
│   ├── models          # Mongoose schemas with encryption hooks
│   └── server.js       # Entry point
├── frontend
│   ├── src
│   │   ├── components  # UI Elements
│   │   ├── pages       # Main Views (Dashboard, Listings, Profile)
│   │   └── services    # API Communication
└── README.md
```

---

## 🛠️ Setup Instructions

### Prerequisites
*   Node.js (v16+)
*   MongoDB Atlas account or local MongoDB instance
*   SMTP credentials (e.g., Gmail App Password) for 2FA emails

### 1. Clone the Repository
```bash
git clone https://github.com/UrbanNest-Secure/UrbanNest_Secure-main.git
cd UrbanNest_Secure-main
```

### 2. Backend Configuration
Navigate to the `backend` directory and create a `.env` file:
```bash
cd backend
npm install
```

**Example `.env`:**
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_seed_for_crypto_engine
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
NODE_ENV=development
```

### 3. Frontend Configuration
Navigate to the root or `frontend` directory:
```bash
cd ../
npm install
```

---

## 🏃 Running the Project

### Start Backend
```bash
cd backend
npm run dev
```

### Start Frontend
```bash
# From the root directory
npm run dev
```
The application will be available at `http://localhost:5173`.

---

## 👥 Role-Based Access Control (RBAC)

| Role | Permissions |
| :--- | :--- |
| **Admin** | Full system oversight, key rotation, user management, global booking moderation. |
| **Owner** | Create and manage property listings, approve/reject tenant bookings for their properties. |
| **Tenant** | Search listings, book properties, write reviews, and manage personal profile. |

---

## 📜 License
This project is developed for academic purposes as part of the Security Architecture and Cryptography lab.
