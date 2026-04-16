# ═══════════════════════════════════════════════════════
#  BotPay Center — Makefile
# ═══════════════════════════════════════════════════════

.PHONY: help up down restart logs shell-api shell-db migrate seed \
        build dev-api dev-frontend status clean

# Colores
CYAN  := \033[0;36m
RESET := \033[0m

help: ## Muestra esta ayuda
	@echo ""
	@echo "  $(CYAN)BotPay Center$(RESET) — Comandos disponibles"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ── Docker ───────────────────────────────────────────────

up: ## Levanta todos los servicios en background
	docker compose up -d --build

down: ## Detiene y elimina los contenedores
	docker compose down

restart: ## Reinicia todos los servicios
	docker compose restart

rebuild: ## Fuerza rebuild de imágenes y levanta
	docker compose up -d --build --force-recreate

logs: ## Sigue los logs de todos los servicios
	docker compose logs -f

logs-api: ## Logs solo del API
	docker compose logs -f botpay-api

logs-nginx: ## Logs solo de Nginx
	docker compose logs -f botpay-nginx

status: ## Estado de los contenedores
	docker compose ps

# ── Base de datos ────────────────────────────────────────

migrate: ## Ejecuta las migraciones (Sequelize sync)
	docker compose exec botpay-api node src/database/migrate.js

seed: ## Carga datos iniciales (admin + pipeline + tags)
	docker compose exec botpay-api node src/database/seed.js

setup-db: migrate seed ## Migra y siembra la base de datos

shell-db: ## Abre psql en el contenedor de PostgreSQL
	docker compose exec botpay-postgres psql -U $${DB_USER} -d $${DB_NAME}

# ── Shells ───────────────────────────────────────────────

shell-api: ## Shell dentro del contenedor API
	docker compose exec botpay-api sh

shell-redis: ## Redis CLI
	docker compose exec botpay-redis redis-cli

# ── Desarrollo local (sin Docker) ────────────────────────

dev-api: ## Inicia el API en modo desarrollo (nodemon)
	npm run dev

dev-frontend: ## Inicia el frontend en modo desarrollo (Vite)
	cd frontend && npm run dev

install: ## Instala dependencias del API y frontend
	npm install
	cd frontend && npm install

# ── Utilidades ───────────────────────────────────────────

env: ## Crea .env desde .env.example (solo si no existe)
	@test -f .env && echo ".env ya existe" || (cp .env.example .env && echo ".env creado desde .env.example")

generate-secret: ## Genera un JWT_SECRET seguro
	@node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

clean: ## Elimina contenedores, volúmenes e imágenes del proyecto
	docker compose down -v --rmi local
	@echo "Limpieza completa"
