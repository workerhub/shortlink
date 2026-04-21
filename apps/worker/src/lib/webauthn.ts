import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type { PasskeyRow } from '../types.js'

export { generateRegistrationOptions, generateAuthenticationOptions }

export async function verifyPasskeyRegistration(
  response: unknown,
  expectedChallenge: string,
  rpID: string,
  origin: string,
) {
  return verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  })
}

export async function verifyPasskeyAuthentication(
  response: unknown,
  expectedChallenge: string,
  rpID: string,
  origin: string,
  passkey: PasskeyRow,
) {
  const transports = passkey.transports
    ? (JSON.parse(passkey.transports) as string[])
    : undefined

  return verifyAuthenticationResponse({
    response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    authenticator: {
      credentialID: passkey.id,
      credentialPublicKey: base64UrlToUint8Array(passkey.public_key),
      counter: passkey.counter,
      transports: transports as Parameters<typeof verifyAuthenticationResponse>[0]['authenticator']['transports'],
    },
  })
}

export function base64UrlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

export function uint8ArrayToBase64Url(buf: Uint8Array): string {
  // LOW-5: Loop instead of spread to avoid RangeError on large keys (V8 limit ~65k args)
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}
