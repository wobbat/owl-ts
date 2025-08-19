sudo pacman -Sy unzip 
curl https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip -O /tmp/bun.zip
unzip /tmp/bun.zip -d /tmp/bun
/tmp/bun "$(pwd)/index.ts"


