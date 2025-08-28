SHELL := /bin/sh

# Installation prefix (override with: make PREFIX=/usr)
PREFIX ?= /usr/local
BINDIR := $(PREFIX)/bin

.PHONY: all build clean install uninstall

all: build

build:
	bun install
	bun run typecheck
	bun build index.ts --compile --outfile ./dist/owl

clean:
	rm -rf dist

# Install standalone executable to $(BINDIR)
install: build
	mkdir -p "$(BINDIR)"
	cp dist/owl "$(BINDIR)/owl"
	chmod +x "$(BINDIR)/owl"

uninstall:
	rm -f "$(BINDIR)/owl"
