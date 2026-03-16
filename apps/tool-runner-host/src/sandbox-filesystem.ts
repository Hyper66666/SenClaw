import { constants as fsConstants } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function toFilePath(value: unknown): string {
  if (value instanceof URL) {
    if (value.protocol !== "file:") {
      throw new Error(`Access denied: ${value.toString()}`);
    }

    return fileURLToPath(value);
  }

  return String(value);
}

export function isWithinRoot(targetPath: string, rootPath: string): boolean {
  const relativePath = relative(rootPath, targetPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

export function createFilesystemAccessController(
  sandboxDirectory: string,
  allowedPaths: string[],
) {
  const sandboxRoot = resolve(sandboxDirectory);
  const readableRoots = [
    sandboxRoot,
    ...allowedPaths.map((entry) => resolve(entry)),
  ];

  const ensureReadAccess = (target: unknown): string => {
    const requestedPath = toFilePath(target);
    const resolvedPath = resolve(requestedPath);
    if (
      readableRoots.some((rootPath) => isWithinRoot(resolvedPath, rootPath))
    ) {
      return resolvedPath;
    }

    throw new Error(`Access denied: ${requestedPath}`);
  };

  const ensureWriteAccess = (target: unknown): string => {
    const requestedPath = toFilePath(target);
    const resolvedPath = resolve(requestedPath);
    if (isWithinRoot(resolvedPath, sandboxRoot)) {
      return resolvedPath;
    }

    throw new Error(`Access denied: ${requestedPath}`);
  };

  const isWriteFlag = (flags: unknown): boolean => {
    if (flags == null) {
      return false;
    }

    if (typeof flags === "number") {
      const writeMask =
        fsConstants.O_WRONLY |
        fsConstants.O_RDWR |
        fsConstants.O_APPEND |
        fsConstants.O_CREAT |
        fsConstants.O_TRUNC;
      return (flags & writeMask) !== 0;
    }

    return /[wa+]/.test(String(flags));
  };

  const ensureAccessMode = (target: unknown, mode: unknown): string => {
    if (typeof mode === "number" && (mode & fsConstants.W_OK) !== 0) {
      return ensureWriteAccess(target);
    }

    return ensureReadAccess(target);
  };

  return {
    ensureReadAccess,
    ensureWriteAccess,
    ensureAccessMode,
    isWriteFlag,
  };
}

export const FILESYSTEM_POLICY_SOURCE = String.raw`
const toFilePath = (value) => {
  if (value instanceof URL) {
    if (value.protocol !== "file:") {
      throw new Error("Access denied: " + value.toString());
    }

    return fileURLToPath(value);
  }

  return String(value);
};

const isWithinRoot = (targetPath, rootPath) => {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const createFsGuards = (sandboxDirectory, allowedPaths) => {
  const sandboxRoot = path.resolve(sandboxDirectory);
  const readableRoots = [sandboxRoot, ...allowedPaths.map((entry) => path.resolve(entry))];

  const ensureReadAccess = (target) => {
    const requestedPath = toFilePath(target);
    const resolvedPath = path.resolve(requestedPath);
    if (readableRoots.some((rootPath) => isWithinRoot(resolvedPath, rootPath))) {
      return resolvedPath;
    }

    throw new Error("Access denied: " + requestedPath);
  };

  const ensureWriteAccess = (target) => {
    const requestedPath = toFilePath(target);
    const resolvedPath = path.resolve(requestedPath);
    if (isWithinRoot(resolvedPath, sandboxRoot)) {
      return resolvedPath;
    }

    throw new Error("Access denied: " + requestedPath);
  };

  const isWriteFlag = (flags) => {
    if (flags == null) {
      return false;
    }

    if (typeof flags === "number") {
      const writeMask =
        fs.constants.O_WRONLY |
        fs.constants.O_RDWR |
        fs.constants.O_APPEND |
        fs.constants.O_CREAT |
        fs.constants.O_TRUNC;
      return (flags & writeMask) !== 0;
    }

    return /[wa+]/.test(String(flags));
  };

  const ensureAccessMode = (target, mode) => {
    if (typeof mode === "number" && (mode & fs.constants.W_OK) !== 0) {
      return ensureWriteAccess(target);
    }

    return ensureReadAccess(target);
  };

  return {
    ensureReadAccess,
    ensureWriteAccess,
    isWriteFlag,
    ensureAccessMode,
  };
};

const applyFilesystemSandbox = (sandboxDirectory, allowedPaths) => {
  const guards = createFsGuards(sandboxDirectory, allowedPaths);

  fs.readFileSync = (targetPath, ...args) =>
    originalFs.readFileSync(guards.ensureReadAccess(targetPath), ...args);
  fs.writeFileSync = (targetPath, ...args) =>
    originalFs.writeFileSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.appendFileSync = (targetPath, ...args) =>
    originalFs.appendFileSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.mkdirSync = (targetPath, ...args) =>
    originalFs.mkdirSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.rmSync = (targetPath, ...args) =>
    originalFs.rmSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.unlinkSync = (targetPath, ...args) =>
    originalFs.unlinkSync(guards.ensureWriteAccess(targetPath), ...args);
  fs.readdirSync = (targetPath, ...args) =>
    originalFs.readdirSync(guards.ensureReadAccess(targetPath), ...args);
  fs.createReadStream = (targetPath, ...args) =>
    originalFs.createReadStream(guards.ensureReadAccess(targetPath), ...args);
  fs.createWriteStream = (targetPath, ...args) =>
    originalFs.createWriteStream(guards.ensureWriteAccess(targetPath), ...args);
  fs.accessSync = (targetPath, mode) =>
    originalFs.accessSync(guards.ensureAccessMode(targetPath, mode), mode);
  fs.copyFileSync = (sourcePath, destinationPath, ...args) =>
    originalFs.copyFileSync(
      guards.ensureReadAccess(sourcePath),
      guards.ensureWriteAccess(destinationPath),
      ...args,
    );
  fs.renameSync = (sourcePath, destinationPath, ...args) =>
    originalFs.renameSync(
      guards.ensureWriteAccess(sourcePath),
      guards.ensureWriteAccess(destinationPath),
      ...args,
    );

  fsPromises.readFile = (targetPath, ...args) =>
    originalFsPromises.readFile(guards.ensureReadAccess(targetPath), ...args);
  fsPromises.writeFile = (targetPath, ...args) =>
    originalFsPromises.writeFile(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.appendFile = (targetPath, ...args) =>
    originalFsPromises.appendFile(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.mkdir = (targetPath, ...args) =>
    originalFsPromises.mkdir(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.rm = (targetPath, ...args) =>
    originalFsPromises.rm(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.unlink = (targetPath, ...args) =>
    originalFsPromises.unlink(guards.ensureWriteAccess(targetPath), ...args);
  fsPromises.readdir = (targetPath, ...args) =>
    originalFsPromises.readdir(guards.ensureReadAccess(targetPath), ...args);
  fsPromises.access = (targetPath, mode) =>
    originalFsPromises.access(guards.ensureAccessMode(targetPath, mode), mode);
  fsPromises.copyFile = (sourcePath, destinationPath, ...args) =>
    originalFsPromises.copyFile(
      guards.ensureReadAccess(sourcePath),
      guards.ensureWriteAccess(destinationPath),
      ...args,
    );
  fsPromises.rename = (sourcePath, destinationPath, ...args) =>
    originalFsPromises.rename(
      guards.ensureWriteAccess(sourcePath),
      guards.ensureWriteAccess(destinationPath),
      ...args,
    );
  fsPromises.open = (targetPath, flags, ...args) => {
    const validatedPath = guards.isWriteFlag(flags)
      ? guards.ensureWriteAccess(targetPath)
      : guards.ensureReadAccess(targetPath);
    return originalFsPromises.open(validatedPath, flags, ...args);
  };

  syncBuiltinESMExports();
};
`;
