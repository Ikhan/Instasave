import type { InstaApi } from '../../shared/types'

declare global {
  interface Window {
    insta: InstaApi
  }
}

declare module '*.css'

export {}
