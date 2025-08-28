SHELL := /bin/sh

# Installation prefix (override with: make PREFIX=/usr)
PREFIX ?= /usr/local
# Simple install directory for Owl payload
APPDIR := $(PREFIX)/owl
BINDIR := $(PREFIX)/bin

.PHONY: all build clean install uninstall

all: build

build:
	bun install
	bun run typecheck
	bun run build

clean:
	rm -rf dist

# Install builds into $(LIBDIR) and adds an 'owl' wrapper in $(BINDIR)
install: build
	mkdir -p "$(APPDIR)"
	mkdir -p "$(BINDIR)"
	cp -r dist/* "$(APPDIR)/" || true
	# Fallback if dist is empty: use index.ts directly (Bun can run TS)
	if [ ! -f "$(APPDIR)/index.js" ] && [ -f "index.ts" ]; then cp index.ts "$(APPDIR)/index.ts"; fi
	# Create wrapper
	printf '%s\n' '#!/bin/sh' 'set -e' \
		'if [ -f "$(APPDIR)/index.js" ]; then' \
		'  exec bun "$(APPDIR)/index.js" "$$@"' \
		'elif [ -f "$(APPDIR)/index.ts" ]; then' \
		'  exec bun "$(APPDIR)/index.ts" "$$@"' \
		'else' \
		'  echo "owl install is incomplete: no entrypoint in $(APPDIR)" >&2; exit 1' \
		'fi' > "$(BINDIR)/owl"
	chmod +x "$(BINDIR)/owl"

uninstall:
	rm -f "$(BINDIR)/owl"
	rm -rf "$(APPDIR)"
