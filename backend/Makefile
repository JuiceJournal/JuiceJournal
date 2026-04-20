# Juice Journal - Makefile
# Docker and common development commands

.PHONY: help up down logs psql pgadmin db-reset install dev test build

# Default target
help:
	@echo "Juice Journal - Available Commands:"
	@echo ""
	@echo "  make up          - Start Docker containers (PostgreSQL, pgAdmin, Redis)"
	@echo "  make down        - Stop Docker containers"
	@echo "  make logs        - Show container logs"
	@echo "  make psql        - Open the PostgreSQL shell"
	@echo "  make pgadmin     - Open pgAdmin in the browser"
	@echo "  make db-reset    - Reset the database (ALL DATA WILL BE DELETED!)"
	@echo "  make install     - Install Node.js dependencies"
	@echo "  make dev         - Start the development server"
	@echo "  make test        - Run tests"
	@echo "  make build       - Create a production build"
	@echo ""

# Docker commands
up:
	docker-compose up -d
	@echo "Containers started:"
	@echo "  - PostgreSQL: localhost:5432"
	@echo "  - pgAdmin:    http://localhost:5050"
	@echo "  - Redis:      localhost:6379"

down:
	docker-compose down

logs:
	docker-compose logs -f

psql:
	docker exec -it juice-journal-db psql -U postgres -d juicejournal

pgadmin:
	@echo "Opening pgAdmin: http://localhost:5050"
	@echo "Email: admin@juicejournal.local"
	@echo "Password: admin123"
	@start http://localhost:5050 || open http://localhost:5050 || xdg-open http://localhost:5050

db-reset:
	@echo "WARNING: This will delete ALL data!"
	@read -p "Do you want to continue? (y/N) " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		docker-compose down -v; \
		docker-compose up -d; \
		echo "Database reset complete"; \
	else \
		echo "Operation canceled"; \
	fi

# Node.js commands
install:
	npm install

dev:
	npm run dev

test:
	npm test

build:
	npm run build

# Database migrations
migrate:
	npm run db:migrate

seed:
	npm run db:seed

# Cleanup
clean:
	docker-compose down -v
	rm -rf node_modules
	rm -rf dist
	@echo "Cleanup complete"

# Start the full stack (Docker + Node.js)
start-all: up install dev
