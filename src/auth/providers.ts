export type LoginProvider = 'google' | 'apple' | 'saml'
export interface LoginProviderOption { id: LoginProvider; identityProvider: string | null }

/** Enable only providers already connected to this pool AND its public client.
 * Provider names are public routing metadata, never credentials or tenant roles.
 */
export function loginProviders(): LoginProviderOption[] {
  const enabled = new Set((process.env.NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS ?? '').split(',').map(name => name.trim()).filter(Boolean))
  const saml = process.env.NEXT_PUBLIC_COGNITO_SAML_PROVIDER?.trim()
  const validSaml = saml && /^[\w.-]{1,32}$/.test(saml) && !['Google', 'SignInWithApple', 'COGNITO', 'Facebook', 'LoginWithAmazon'].includes(saml)
  return [
    { id: 'google', identityProvider: enabled.has('Google') ? 'Google' : null },
    { id: 'apple', identityProvider: enabled.has('SignInWithApple') ? 'SignInWithApple' : null },
    { id: 'saml', identityProvider: validSaml && enabled.has(saml) ? saml : null },
  ]
}
export function providerName(provider: LoginProvider): string {
  const name = loginProviders().find(option => option.id === provider)?.identityProvider
  if (!name) throw new Error('This sign-in provider is not connected yet.')
  return name
}
