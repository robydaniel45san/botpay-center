# BotPay Center

CRM + chatbot de WhatsApp para cobros QR via PayCenter.

**Qué hace:**
- Recibe mensajes de WhatsApp (Meta Cloud API) y los procesa con un motor de flujos conversacionales
- Genera QRs de cobro a través de PayCenter y los envía al cliente por WhatsApp
- Panel CRM en tiempo real para que los agentes gestionen conversaciones
- Polling automático de estado de pagos cada 10s (no depende de webhook de PayCenter)

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + Express + Socket.io |
| Base de datos | SQLite (dev) / PostgreSQL (prod) |
| Sesiones | Redis |
| Frontend | React 19 + Vite + Tailwind CSS |
| Infraestructura | Docker + Nginx |

---

## Estructura del proyecto

```
/
├── frontend/      ← CRM visual (React 19 + Vite + Tailwind)
├── backend/       ← Lógica del bot, pagos y API REST
│   └── src/
│       ├── config/           configuración (db, redis, meta, logger)
│       ├── middleware/        auth JWT, manejo de errores
│       ├── models/            12 modelos Sequelize
│       ├── database/          migrate + seed
│       ├── domain/ports/      abstracción de pagos
│       ├── routes/            rutas Express
│       ├── controllers/       handlers HTTP
│       ├── services/
│       │   ├── bot/           motor + flujos conversacionales
│       │   ├── agents/        orquestador, recepcionista, QR creator, agenda, watchdog
│       │   ├── whatsapp/      cliente Meta API
│       │   ├── paycenter/     servicio QR de negocio
│       │   ├── payment/       polling de estado QR
│       │   ├── crm/           servicio de contactos
│       │   └── mock/          QRs y datos simulados (solo dev)
│       └── infrastructure/
│           ├── paycenter/     adaptador PayCenter (ACL)
│           └── services/      service registry + signed client
├── docker-compose.yml
├── nginx.conf
├── Makefile
└── .env.example
```

---

## Setup rápido

### 1. Variables de entorno

Cada parte tiene su propio `.env`:

```bash
make env
# Crea backend/.env y frontend/.env desde sus respectivos .env.example
# Editar cada uno con los valores reales
```

**`backend/.env`** — variables obligatorias:
```
META_PHONE_NUMBER_ID=...
META_ACCESS_TOKEN=...
META_WEBHOOK_VERIFY_TOKEN=...
PAYCENTER_API_URL=http://localhost:3000/api/v1/bo
PAYCENTER_JWT_SECRET=mismo_secret_que_usa_paycenter
PAYCENTER_MERCHANT_ID=1
JWT_SECRET=genera_con_crypto_randomBytes_64
```

**`frontend/.env`** — solo una variable:
```
VITE_BUSINESS_NAME=Mi Negocio
```

### 2. Con Docker (recomendado)

```bash
make up          # Levanta todo (API + frontend + Postgres + Redis + Nginx)
make migrate     # Crea tablas
make seed        # Carga datos iniciales (admin + pipeline + tags)
```

Panel CRM: `http://localhost:4080`
API: `http://localhost:4080/api/health`

Credenciales iniciales: `admin@botpay.local` / `Admin1234!`

### 3. Sin Docker (desarrollo)

```bash
make install          # Instala deps de backend/ y frontend/
make dev-api          # API en :4000  (desde backend/)
make dev-frontend     # Frontend en :4001
```

---

## Conexión con PayCenter

El adaptador está en `src/infrastructure/paycenter/`. Solo necesitás configurar 3 cosas en `.env`:

```
PAYCENTER_API_URL=http://<host-paycenter>/api/v1/bo
PAYCENTER_JWT_SECRET=<secret_compartido_con_paycenter>
PAYCENTER_MERCHANT_ID=<id_del_merchant_en_paycenter>
```

El sistema firma cada petición con JWT usando `PAYCENTER_JWT_SECRET`.

**Endpoints que usa BotPay sobre PayCenter:**

| Método | Ruta | Para qué |
|---|---|---|
| POST | `/merchant/bank/:bank/qr` | Crear QR de cobro |
| GET | `/merchant/qr/:id/status` | Consultar estado del QR |
| DELETE | `/merchant/bank/:bank/qr` | Cancelar QR |

**Callback de PayCenter → BotPay:**

Configurar en PayCenter que llame a:
```
POST http://<tu-dominio>/api/paycenter/payment-callback
```
Con header `X-Callback-Secret: <PAYCENTER_CALLBACK_SECRET>`.

**Modo mock** (desarrollo sin PayCenter):

```env
PAYCENTER_MOCK=true
```

Genera QRs reales (PNG escaneables) sin necesitar PayCenter.

---

## Estructura principal

```
src/
├── server.js                    # Entry point
├── infrastructure/paycenter/    # Adaptador PayCenter (ACL)
│   ├── paycenter.adapter.js     # Único punto de entrada al gateway
│   ├── paycenter.http.js        # Cliente HTTP crudo
│   └── paycenter.mapper.js      # Mapeo de campos PayCenter ↔ BotPay
├── services/
│   ├── bot/flows/               # Flujos conversacionales (11 flujos)
│   ├── paycenter/qr.service.js  # Lógica de negocio de pagos
│   └── payment/qr-polling.service.js  # Polling de estado cada 10s
├── models/                      # ORM Sequelize (12 modelos)
├── controllers/                 # HTTP handlers
└── routes/                      # Rutas Express
frontend/
└── src/                         # React 19 + Vite
```

---

## Comandos útiles

```bash
make up          # Levantar servicios Docker
make down        # Parar servicios
make logs        # Ver logs en tiempo real
make migrate     # Sincronizar esquema de BD
make seed        # Datos iniciales
make clean       # Teardown completo
npm run dev      # API en modo desarrollo (SQLite + Redis mock)
```

---

## Webhook de Meta

El bot recibe mensajes en:
```
POST /api/webhook/whatsapp
GET  /api/webhook/whatsapp  (verificación Meta)
```

Para exponer en desarrollo usar cloudflared o ngrok:
```bash
cloudflared tunnel --url http://localhost:4000
```
