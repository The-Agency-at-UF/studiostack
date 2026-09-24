const firebasePublicEnv = (name) =>
  process.env[`NEXT_PUBLIC_FIREBASE_${name}`] ??
  process.env[`VITE_FIREBASE_${name}`]

const nextConfig = {
  agentRules: false,
  output: 'export',
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: firebasePublicEnv('API_KEY'),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: firebasePublicEnv('AUTH_DOMAIN'),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: firebasePublicEnv('PROJECT_ID'),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: firebasePublicEnv('STORAGE_BUCKET'),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: firebasePublicEnv('MESSAGING_SENDER_ID'),
    NEXT_PUBLIC_FIREBASE_APP_ID: firebasePublicEnv('APP_ID'),
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: firebasePublicEnv('MEASUREMENT_ID'),
  },
}

export default nextConfig
