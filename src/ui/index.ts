import pc from "picocolors";
import { SPINNER_FRAME_INTERVAL, SPINNER_FRAMES, PACKAGE_INSTALL_DELAY, DOTFILES_INSTALL_DELAY } from "../utils/constants";
import type { SpinnerOptions } from "../types";

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
  info: pc.gray,
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
      const modeWidth = mode.length;
      const separator = styles.primary(":".repeat(modeWidth + 18));
      console.log(separator);
      console.log("  " + styles.accent(mode) + " mode Starting" );
      console.log(separator);
    }
    console.log();
  },

  sectionHeader: (section: string, color?: string) => {
    console.log();
    let badge;
    switch (color) {
      case 'red':
        // Using darker red #a63a3a (color9) with white text
        badge = `\x1b[48;2;166;58;58m\x1b[38;2;255;255;255m ${section} \x1b[0m`;
        break;
      case 'yellow':
        // Using yellow #ffb365 (color3) with black text
        badge = `\x1b[48;2;255;179;101m\x1b[38;2;0;0;0m ${section} \x1b[0m`;
        break;
      case 'magenta':
        // Using darker magenta #8c686a (color13) with white text
        badge = `\x1b[48;2;140;104;106m\x1b[38;2;255;255;255m ${section} \x1b[0m`;
        break;
      case 'blue':
      default:
        // Using blue #68778c (color4) with white text
        badge = `\x1b[48;2;104;119;140m\x1b[38;2;255;255;255m ${section} \x1b[0m`;
        break;
    }
    console.log(badge);
    console.log();
  },

  overview: (stats: {host: string, packages: number}) => {
    console.log(`  ${pc.dim("host:")}     ${stats.host}`);
    console.log(`  ${pc.dim("packages:")} ${stats.packages}`);
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
    // Show package source (host/group) if available
    const sourcePrefix = packageEntry ? formatPackageSource(packageEntry) : "";
    console.log(`${sourcePrefix}${pc.cyan(packageName)} ${styles.muted("->")}`);

    if (!streamMode) {
      // Show package installation progress
      process.stdout.write(`  Package - ${styles.muted("installing...")}`);
      await new Promise(resolve => setTimeout(resolve, PACKAGE_INSTALL_DELAY));
      process.stdout.write(`\r  Package - ${styles.success("installed")}     \n`);

      // Show dotfiles installation if needed
      if (hasDotfiles) {
        process.stdout.write(`  Dotfiles - ${styles.muted("installing...")}`);
        await new Promise(resolve => setTimeout(resolve, DOTFILES_INSTALL_DELAY));
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
    const messageWidth = text.length;
    const separator = styles.success(":".repeat(messageWidth));
    console.log(separator);
    console.log(styles.accent(text));
    console.log(separator);
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
   },

    showSystemMaintenance: () => {
      console.log("  Performing system maintenance!");
    },

    showPackagesToUpgrade: (packages: string[]) => {
      console.log("  Packages to upgrade:");
      for (const pkg of packages) {
        console.log(`    ${icon.upgrade} ${styles.accent(pkg)}`);
      }
      console.log();
    },

    showAllPackagesUpgraded: () => {
      console.log(`  ${icon.ok} All packages upgraded to latest versions`);
    },

    showPackageCleanup: (toRemove: Array<{name: string}>) => {
      console.log("  Package cleanup (removing conflicting packages):");
      for (const pkg of toRemove) {
        console.log(`    ${icon.remove} Removing: ${styles.accent(pkg.name)}`);
      }
    },

    showRemovalWarning: (err: Error) => {
      console.log(`  ${icon.warn} Warning: Failed to update managed packages state: ${err.message}`);
    },

    showPackagesRemoved: (count: number) => {
      console.log(`  ${icon.ok} Removed ${count} packages`);
      console.log();
    },

    systemMessage: (text: string) => {
      const messageWidth = text.length;
      const separator = styles.success(":".repeat(messageWidth + 4));
      console.log(separator);
      console.log( "  " + styles.accent(text));
      console.log(separator);
    },

    errorMessage: (text: string) => {
      console.error(`${styles.error("::")} ${styles.accent(text)} ${styles.error("::")}`);
    },

    aurDownMessage: () => {
      console.log(`${styles.error("::")} ${styles.accent("AUR DOWN")} ${styles.error("::")}`);
    },

    configManagementHeader: () => {
      console.log();
      // Using darker magenta #8c686a (color13) with white text
      const badge = `\x1b[48;2;140;104;106m\x1b[38;2;255;255;255m Config \x1b[0m`;
      console.log(badge);
      console.log();
      console.log("  Config management:");
    },

    configPackagesSummary: (summary: string) => {
      console.log(`  ${pc.cyan(summary)} ${styles.muted("->")}`);
    }
 };

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
        const message = reason ? `${text} ${styles.error(reason)}` : text;
        console.error(`${icon.err} ${styles.error(message)}`);
      },
      update(_newText: string) {
        // No-op for disabled spinner
      }
    };
  }

  const frames = SPINNER_FRAMES;
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
      process.stdout.write(`\r  ${color(frame)} ${color(currentText)}  `);
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
        // Show timing information on a second line with dimmed text
        process.stdout.write(`\r  ${icon.ok} ${styles.success(currentText)}\n`);
        if (suffix) {
          console.log(`    ${styles.muted(suffix)} ${timing}`);
        } else {
          console.log(`    ${timing}`);
        }
      }
    },

    fail(reason?: string) {
      stopped = true;
      clearInterval(intervalId);
      const duration = Date.now() - startTime;
      const timing = styles.muted(`(${duration}ms)`);
      const message = reason ? ` ${styles.muted(reason)}` : "";
      // For package installs, show "Package - failed" format
      if (currentText.includes('Package - installing')) {
        process.stdout.write(`\r  Package - ${styles.error('failed')} ${timing}${message}\n`);
      } else if (currentText.includes('Dotfiles - checking') || currentText.includes('Dotfiles - syncing')) {
        process.stdout.write(`\r  Dotfiles - ${styles.error('failed')} ${timing}${message}\n`);
      } else {
        process.stdout.write(`\r${icon.err} ${styles.error(currentText)} ${timing}${message}\n`);
      }
    },

    update(newText: string) {
      if (newText) currentText = newText;
    }
  };
}
