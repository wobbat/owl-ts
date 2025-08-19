sudo pacman -Sy unzip
curl -L https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip -o /tmp/bun.zip
unzip /tmp/bun.zip -d /tmp/bun
/tmp/bun/bun "$(pwd)/index.ts"

