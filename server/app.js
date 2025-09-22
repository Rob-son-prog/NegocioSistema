// server/app.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// A pasta pública é a raiz do projeto (onde ficam index.html, style.css, etc.)
export const PUBLIC_DIR = path.resolve(__dirname, '..');

// ====== APP PRIMEIRO, ANTES DE QUALQUER ROTA ======
export const app = express();

/* ===================== CORS ===================== */
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:4000',
  'https://negociosistema.onrender.com',
];

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Delete-Code', 'X-Backup-Token'],
  credentials: true,
}));

app.options('*', cors());
app.use(express.json());

// servir arquivos estáticos do front (index.html, style.css, *.js)
app.use(express.static(PUBLIC_DIR));
