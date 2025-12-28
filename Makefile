.PHONY: backup restore backup-list

# PostgreSQL Backup/Restore
backup:
	@./scripts/backup_postgres.sh

restore:
	@if [ -z "$(FILE)" ]; then \
		echo "Usage: make restore FILE=backups/db_YYYY-MM-DD_HHMMSS.sql.gz"; \
		exit 1; \
	fi
	@echo "Restoring from $(FILE)..."
	@gunzip -c $(FILE) | docker exec -i books_db psql -U app books
	@echo "Restore completed"

backup-list:
	@echo "Available backups:"
	@ls -lh backups/*.sql.gz 2>/dev/null || echo "  No backups found"
