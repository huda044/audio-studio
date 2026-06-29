# Build
.PHONY: setup dev test build clean lint format

# Default target
help:
	@echo "Audio Studio - Development Commands"
	@echo "==================================="
	@echo "make setup       - Install all dependencies"
	@echo "make dev         - Start development servers"
	@echo "make test        - Run all tests"
	@echo "make test:server - Run server tests only"
	@echo "make test:client - Run client tests only"
	@echo "make build       - Build client for production"
	@echo "make clean       - Clean build artifacts"
	@echo "make lint        - Run all linters"
	@echo "make docker      - Build Docker image"
	@echo "make deps        - Check outdated dependencies"

setup:
	cd server && npm install
	cd ../client && npm install
	@echo "✓ Dependencies installed"

dev:
	@echo "Starting development servers..."
	@echo "Server: http://localhost:4000"
	@echo "Client: http://localhost:5173"
	@start powershell -Command "cd server; npm run dev"
	@start powershell -Command "cd client; npm run dev"
	@echo "✓ Development servers started"

test:
	cd server && npm test
	cd ../client && npm test

test:server:
	cd server && npm test

test:client:
	cd client && npm test

test:coverage:
	cd server && npm run test:coverage
	cd ../client && npm run test:coverage

build:
	cd client && npm run build
	@echo "✓ Client built successfully"

clean:
	rm -rf client/dist
	rm -rf server/coverage
	rm -rf client/coverage
	@echo "✓ Build artifacts cleaned"

lint:
	cd server && npm run lint
	cd ../client && npm run lint

lint:fix:
	cd server && npm run lint:fix
	cd ../client && npm run lint:fix

format:
	cd server && npm run format
	cd ../client && npm run format

docker:
	docker build -t audio-studio .
	@echo "✓ Docker image built: audio-studio"

deps:
	cd server && npm outdated
	cd ../client && npm outdated

security:
	cd server && npm audit
	cd ../client && npm audit

docker-compose-up:
	docker-compose up -d
	@echo "✓ Docker Compose started"

docker-compose-down:
	docker-compose down
	@echo "✓ Docker Compose stopped"
