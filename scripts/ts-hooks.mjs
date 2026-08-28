/** Lets plain `node` run the scripts in this folder even though the modules in
 *  src/ use extensionless relative imports (which Next resolves for us). */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return await next(specifier, context);
    } catch (err) {
      if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
      return next(`${specifier}.ts`, context);
    }
  }
  return next(specifier, context);
}
