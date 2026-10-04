/**
 * Loads environment variables from the repository-root `.env` file.
 *
 * Import this module first (`import './config/env.js'`) so variables are
 * available before any other module is evaluated. Resolving the path from
 * this file — not from process.cwd() — means the server and every script
 * pick up the same `.env` regardless of where they are launched from.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
