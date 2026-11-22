export function isApplicationPagePath(value: string) {
  return value.length<=255 && /^\/[A-Za-z0-9/_-]*$/.test(value) && !value.startsWith('//')
}
