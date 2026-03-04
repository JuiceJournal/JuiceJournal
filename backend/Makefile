# PoE Farm Tracker - Makefile
# Docker ve diger yaygin komutlari kolaylastirir

.PHONY: help up down logs psql pgadmin db-reset install dev test build

# Varsayilan hedef
help:
	@echo "PoE Farm Tracker - Kullanilabilir Komutlar:"
	@echo ""
	@echo "  make up          - Docker container'lari baslat (PostgreSQL, pgAdmin, Redis)"
	@echo "  make down        - Docker container'lari durdur"
	@echo "  make logs        - Container loglarini goster"
	@echo "  make psql        - PostgreSQL shell'e baglan"
	@echo "  make pgadmin     - pgAdmin ac (tarayici)"
	@echo "  make db-reset    - Veritabanini sifirla (TUM VERILER SILINIR!)"
	@echo "  make install     - Node.js bagimliliklarini yukle"
	@echo "  make dev         - Gelistirme sunucusunu baslat"
	@echo "  make test        - Testleri calistir"
	@echo "  make build       - Uretim build'i al"
	@echo ""

# Docker Komutlari
up:
	docker-compose up -d
	@echo "Container'lar baslatildi:"
	@echo "  - PostgreSQL: localhost:5432"
	@echo "  - pgAdmin:    http://localhost:5050"
	@echo "  - Redis:      localhost:6379"

down:
	docker-compose down

logs:
	docker-compose logs -f

psql:
	docker exec -it poe-farm-db psql -U postgres -d poefarm

pgadmin:
	@echo "pgAdmin aciliyor: http://localhost:5050"
	@echo "Email: admin@poefarm.local"
	@echo "Sifre: admin123"
	@start http://localhost:5050 || open http://localhost:5050 || xdg-open http://localhost:5050

db-reset:
	@echo "UYARI: Bu islem TUM verileri silecek!"
	@read -p "Devam etmek istiyor musunuz? (y/N) " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		docker-compose down -v; \
		docker-compose up -d; \
		echo "Veritabani sifirlandi"; \
	else \
		echo "Islem iptal edildi"; \
	fi

# Node.js Komutlari
install:
	npm install

dev:
	npm run dev

test:
	npm test

build:
	npm run build

# Veritabani migration
migrate:
	npm run db:migrate

seed:
	npm run db:seed

# Temizlik
clean:
	docker-compose down -v
	rm -rf node_modules
	rm -rf dist
	@echo "Temizlik tamamlandi"

# Tum sistemi baslat (Docker + Node.js)
start-all: up install dev
