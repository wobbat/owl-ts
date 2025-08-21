import pc from "picocolors";
import { SPINNER_FRAME_INTERVAL, PACKAGE_INSTALL_DELAY, DOTFILES_INSTALL_DELAY } from "./constants";

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
  info: pc.cyan,
  muted: pc.dim,
  accent: pc.white,
  highlight: pc.magenta,
  subtle: pc.gray,
  bold: pc.bold,
  italic: pc.italic,
  underline: pc.underline,
};

export { styles };

// Enhanced visual elements
export const box = {
  top: "┌",
  bottom: "└",
  vertical: "│",
  horizontal: "─",
  cross: "┼",
  leftT: "├",
  rightT: "┤",
  topT: "┬",
  bottomT: "┴",
};

export function createBox(content: string, options: { width?: number; padding?: number; style?: (s: string) => string } = {}): string {
  const { width = 60, padding = 1, style = styles.accent } = options;
  const lines = content.split('\n');
  const innerWidth = width - 2 - (padding * 2);

  const topBorder = box.top + box.horizontal.repeat(width - 2) + box.top;
  const bottomBorder = box.bottom + box.horizontal.repeat(width - 2) + box.bottom;

  const wrappedLines = lines.flatMap(line => {
    if (line.length <= innerWidth) return [line];
    const words = line.split(' ');
    const wrapped = [];
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 <= innerWidth) {
        current += (current ? ' ' : '') + word;
      } else {
        if (current) wrapped.push(current);
        current = word;
      }
    }
    if (current) wrapped.push(current);
    return wrapped;
  });

  const paddedLines = wrappedLines.map(line =>
    ' '.repeat(padding) + line.padEnd(innerWidth) + ' '.repeat(padding)
  );

  const contentLines = paddedLines.map(line => box.vertical + style(line) + box.vertical);

  return [topBorder, ...contentLines, bottomBorder].join('\n');
}

export function createProgressBar(current: number, total: number, options: { width?: number; complete?: string; incomplete?: string } = {}): string {
  const { width = 30, complete = '█', incomplete = '░' } = options;
  const percentage = Math.min(100, Math.max(0, (current / total) * 100));
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  const bar = complete.repeat(filled) + incomplete.repeat(empty);
  return `${bar} ${percentage.toFixed(0).padStart(3)}%`;
}

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
      // Show enhanced colored badge for the current mode
      const badge = mode === 'dry-run'
        ? pc.bgYellow(pc.black(` 🧪 Dry run `))
        : pc.bgGreen(pc.black(` ⚡ ${mode} `));
      console.log(` ${badge} `);
    }
    console.log();
  },

  section: (title: string, options: { icon?: string; color?: (s: string) => string } = {}) => {
    const { icon = "📦", color = styles.primary } = options;
    console.log();
    console.log(`${color(icon)} ${styles.bold(title)}`);
    console.log(color("─".repeat(50)));
  },

  status: (label: string, status: 'success' | 'error' | 'warning' | 'info' | 'pending', details?: string) => {
    const statusIcons = {
      success: { icon: "✓", color: styles.success },
      error: { icon: "✗", color: styles.error },
      warning: { icon: "⚠", color: styles.warning },
      info: { icon: "ℹ", color: styles.info },
      pending: { icon: "⟳", color: styles.muted }
    };

    const { icon, color } = statusIcons[status];
    const detailText = details ? ` ${styles.muted(`(${details})`)}` : '';
    console.log(`${color(icon)} ${label}${detailText}`);
  },

  overview: (stats: {host: string, packages: number}) => {
    const overviewBox = createBox(
      `${styles.bold("System Overview")}\n\n` +
      `${styles.muted("Host:")} ${styles.accent(stats.host)}\n` +
      `${styles.muted("Packages:")} ${styles.accent(stats.packages.toString())}\n` +
      `${styles.muted("Mode:")} ${styles.highlight("Active")}`,
      { width: 45, style: styles.info }
    );
    console.log(overviewBox);
    console.log();
  },

  installHeader: () => {
    console.log();
    console.log(styles.bold("🚀 Installation Progress"));
    console.log(styles.primary("═".repeat(50)));
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
    // Show package source (host/group) if available
    const sourcePrefix = packageEntry ? formatPackageSource(packageEntry) : "";

    if (!streamMode) {
      console.log(`${sourcePrefix}${styles.bold(packageName)}`);

      // Enhanced package installation with progress
      const packageSpinner = spinner("  Package installation", { enabled: true });
      await new Promise(resolve => setTimeout(resolve, PACKAGE_INSTALL_DELAY));
      packageSpinner.stop("installed ✓");

      // Show dotfiles installation if needed
      if (hasDotfiles) {
        const dotfilesSpinner = spinner("  Dotfiles setup", { enabled: true });
        await new Promise(resolve => setTimeout(resolve, DOTFILES_INSTALL_DELAY));
        dotfilesSpinner.stop("configured ✓");
      }

      console.log();
    } else {
      console.log(`${sourcePrefix}${styles.accent(packageName)} ${styles.muted("-> processing...")}`);
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
  }, SPINNER_FRAME_INTERVAL);
  
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
