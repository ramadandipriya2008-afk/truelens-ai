import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined)?.trim() ||
  ''
)

const supabaseAnonKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  ''
)

const isValidSupabaseUrl = (() => {
  try {
    const parsed = new URL(supabaseUrl)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
})()

const hasRealBrowserKey = Boolean(supabaseAnonKey) &&
  !supabaseAnonKey.startsWith('PASTE_') &&
  !supabaseAnonKey.startsWith('your-') &&
  supabaseAnonKey.length > 20

const isConfigured = isValidSupabaseUrl && hasRealBrowserKey

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export const supabaseConfig = {
  url: supabaseUrl,
  configured: isConfigured,
}
