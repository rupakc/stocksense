.PHONY: dev backend frontend install lint test docker

install:
	cd backend && pip install -e ".[dev]"
	cd frontend && npm install

backend:
	cd backend && uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

dev:
	make -j2 backend frontend

test:
	cd backend && pytest tests/ -v

lint:
	cd backend && ruff check app/
	cd frontend && npm run lint

docker:
	docker-compose up --build

docker-dev:
	docker-compose -f docker-compose.dev.yml up --build
