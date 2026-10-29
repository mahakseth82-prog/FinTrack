import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const nonPlaceholderString = (envName: string, helpText: string) =>
  z
    .string({
      required_error: `Missing ${envName}. ${helpText}`,
    })
    .min(10, `Invalid ${envName}. ${helpText}`)
    .refine(
      (val) =>
        !val.includes('your-project-id') &&
        !val.includes('your-supabase') &&
        !val.includes('your-gemini') &&
        !val.includes('dummy'),
      {
        message: `${envName} still has a placeholder value. ${helpText}`,
      }
    );

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  SUPABASE_URL: nonPlaceholderString(
    'SUPABASE_URL',
    'Open https://supabase.com -> Project Settings -> API -> Copy Project URL into backend/.env'
  ),
  SUPABASE_ANON_KEY: nonPlaceholderString(
    'SUPABASE_ANON_KEY',
    'Open https://supabase.com -> Project Settings -> API -> Copy "anon public" key into backend/.env'
  ),
  SUPABASE_SERVICE_ROLE_KEY: nonPlaceholderString(
    'SUPABASE_SERVICE_ROLE_KEY',
    'Open https://supabase.com -> Project Settings -> API -> Copy "service_role secret" key into backend/.env'
  ),
  GEMINI_API_KEY: nonPlaceholderString(
    'GEMINI_API_KEY',
    'Open https://aistudio.google.com -> Get API Key -> Create API key and paste into backend/.env'
  ),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates all mandatory external credentials on backend startup.
 * Prints a clear, beginner-friendly Hinglish/English guide and exits if any key is missing.
 */
export function validateEnvOnStartup(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('\n============================================================================');
    console.error('🛑 FINTRACK CREDENTIAL CHECKPOINT — MISSING OR INVALID .env KEYS');
    console.error('============================================================================');
    console.error(
      'Namaste! FinTrack Backend chalane ke liye aapko backend/.env file mein asli keys daalni hongi:\n'
    );

    for (const issue of parsed.error.issues) {
      console.error(`  ❌ [${issue.path.join('.')}]: ${issue.message}`);
    }

    console.error('\n📋 HOW TO FIX (3 EASY STEPS):');
    console.error('  1. Copy "backend/.env.example" to "backend/.env"');
    console.error('  2. Paste your real Supabase URL, Anon Key, Service Role Key & Gemini API Key');
    console.error('  3. Restart the server with: npm run dev');
    console.error('============================================================================\n');
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnvOnStartup();

