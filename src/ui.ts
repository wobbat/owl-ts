import pc from "picocolors";

export const icon = {
  ok: pc.green("+"),
  err: pc.red("-"),
  info: pc.blue("i"),
  warn: pc.yellow("!"),
  bullet: pc.dim("•"),
  link: pc.blue("link"),
  script: pc.blue("script"),
  upgrade: pc.yellow("upgrade"),
  install: pc.green("install"),
  remove: pc.red("remove"),
  skip: pc.gray("skip"),
  sync: pc.blue("sync"),
  owl: "",
};

const styles = {
  primary: pc.blue,
  secondary: pc.dim,
  success: pc.green,
  error: pc.red,
  warning: pc.yellow,
  info: pc.dim,
  muted: pc.dim,
  accent: pc.white,
};

export { styles };

export function formatPackageSource(entry: {sourceType?: string, sourceFile?: string, groupName?: string}): string {
  if (!entry.sourceType) return "";
  
  switch (entry.sourceType) {
    case 'host':
      // Extract hostname from path like ~/.owl/hosts/hostname.owl
      const hostMatch = entry.sourceFile?.match(/hosts\/(.+)\.owl$/);
      const hostname = hostMatch ? hostMatch[1] : 'unknown';
      return `${styles.info('@host')} ${styles.warning(hostname)}: `;
    case 'group':
      return `${styles.info('@group')} ${styles.warning(entry.groupName || 'unknown')}: `;
    case 'main':
      return "";
    default:
      return "";
  }
}

export const ui = {
  header: (mode?: string) => {
    console.log();
    if (mode) {
      // Create status badge with colored background
      const badge = mode === 'dry-run' 
        ? pc.bgYellow(pc.black(` Dry run `))
        : pc.bgGreen(pc.black(` ${mode} `));
      console.log(` ${badge} `);
    }
    console.log();
  },

  overview: (stats: {host: string, packages: number}) => {
    console.log(pc.dim("host:") + ` ${stats.host}`);
    console.log(pc.dim("packages:") + ` ${stats.packages}`);
    console.log();
    console.log(pc.yellow(":::::::::::::::"));
    console.log();
  },

  installHeader: () => {
    console.log(styles.primary("Installing:"));
  },

  info: (text: string) => console.log(`${icon.info} ${styles.info(text)}`),
  ok: (text: string) => console.log(`${icon.ok} ${styles.success(text)}`),
  err: (text: string) => console.error(`${icon.err} ${styles.error(text)}`),
  warn: (text: string) => console.log(`${icon.warn} ${styles.warning(text)}`),
  
  list: (items: string[], options: { indent?: boolean; numbered?: boolean; color?: (s: string) => string } = {}) => {
    const { indent = true, numbered = false, color = styles.accent } = options;
    const prefix = indent ? "  " : "";
    
    items.forEach((item, index) => {
      const marker = numbered ? styles.muted(`${index + 1}.`) : icon.bullet;
      console.log(`${prefix}${marker} ${color(item)}`);
    });
  },

  packageInstallProgress: async (packageName: string, hasDotfiles: boolean = false, streamMode: boolean = false, packageEntry?: any) => {
    const sourcePrefix = packageEntry ? formatPackageSource(packageEntry) : "";
    process.stdout.write(`${sourcePrefix}${styles.accent(packageName)} ${styles.muted("->")}\n`);
    
    if (!streamMode) {
      process.stdout.write(`  Package - ${styles.muted("installing...")}`);
      await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
      process.stdout.write(`\r  Package - ${styles.success("installed")}     \n`);
      
      if (hasDotfiles) {
        process.stdout.write(`  Dotfiles - ${styles.muted("installing...")}`);
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 150));
        process.stdout.write(`\r  Dotfiles - ${styles.success("installed")}     \n`);
      }
      
      console.log();
    }
  },

  packageInstallComplete: (_packageName: string, hasDotfiles: boolean = false) => {
    if (hasDotfiles) {
      process.stdout.write(`  Dotfiles - ${styles.success("installed")}     \n`);
    }
    console.log();
  },

  
  success: (text: string) => {
    console.log();
    console.log(styles.success(text));
    console.log();
  },
  
  error: (text: string) => {
    console.log();
    console.error(styles.error(text));
    console.log();
  },

  celebration: (text: string) => {
    console.log();
    console.log(styles.success(text));
    console.log();
  }
};

export interface SpinnerOptions {
  enabled?: boolean;
  color?: (s: string) => string;
}

export function spinner(text: string, options: SpinnerOptions = {}) {
  const enabled = options.enabled !== false;
  const color = options.color || styles.primary;
  
  if (!enabled) {
    return {
      stop(suffix?: string) { 
        const message = suffix ? `${text} ${styles.info(suffix)}` : text;
        console.log(`${icon.ok} ${styles.success(message)}`);
      },
      fail(reason?: string) { 
        const message = reason ? `${text} ${styles.info(reason)}` : text;
        console.error(`${icon.err} ${styles.error(message)}`);
      },
      update(_newText: string) {
        // No-op for disabled spinner
      }
    };
  }
  
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  let frameIndex = 0;
  let stopped = false;
  let currentText = text;
  const startTime = Date.now();
  
  const intervalId = setInterval(() => {
    if (stopped) return;
    const frame = frames[frameIndex = (frameIndex + 1) % frames.length] || "⠋";
    // Check if this is a package installation or dotfiles spinner for proper indentation
    if (currentText.includes('Package - installing') || currentText.includes('Dotfiles - checking') || currentText.includes('Dotfiles - syncing')) {
      process.stdout.write(`\r  ${color(frame)} ${currentText}  `);
    } else {
      process.stdout.write(`\r${color(frame)} ${color(currentText)}  `);
    }
  }, 100);
  
  return {
    stop(suffix?: string) {
      stopped = true;
      clearInterval(intervalId);
      const duration = Date.now() - startTime;
      const timing = styles.muted(`(${duration}ms)`);
      const message = suffix ? ` ${suffix}` : "";
      // For package installs, show "Package - installed" format
      if (currentText.includes('Package - installing')) {
        process.stdout.write(`\r  Package - ${styles.success('installed')} ${timing}${message}     \n`);
      } else if (currentText.includes('Dotfiles - checking')) {
        process.stdout.write(`\r  Dotfiles - ${styles.success('up to date')} ${timing}${message}     \n`);
      } else if (currentText.includes('Dotfiles - syncing')) {
        process.stdout.write(`\r  Dotfiles - ${styles.success('synced')} ${timing}${message}     \n`);
      } else {
        process.stdout.write(`\r${icon.ok} ${styles.success(currentText)} ${timing}${message}\n`);
      }
    },
    
    fail(reason?: string) {
      stopped = true;
      clearInterval(intervalId);
      const message = reason ? ` ${styles.muted(reason)}` : "";
      // For package installs, show "Package - failed" format
      if (currentText.includes('Package - installing')) {
        process.stdout.write(`\r  Package - ${styles.error('failed')}${message}\n`);
      } else if (currentText.includes('Dotfiles - checking') || currentText.includes('Dotfiles - syncing')) {
        process.stdout.write(`\r  Dotfiles - ${styles.error('failed')}${message}\n`);
      } else {
        process.stdout.write(`\r${icon.err} ${styles.error(currentText)}${message}\n`);
      }
    },

    update(newText: string) {
      if (newText) currentText = newText;
    }
  };
}
