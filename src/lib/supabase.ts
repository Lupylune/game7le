import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** `null` si le backend n'est pas configuré : l'app reste 100% jouable en local. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
