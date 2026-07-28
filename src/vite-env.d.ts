/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_MAPILLARY_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * API VirtualKeyboard (Chrome Android) : permet de demander l'ouverture du
 * clavier virtuel sur un champ déjà au foyer, sans nouveau geste de
 * l'utilisateur. Absente ailleurs (iOS, Firefox), d'où l'appel optionnel.
 */
interface Navigator {
  readonly virtualKeyboard?: {
    show(): void;
    hide(): void;
    overlaysContent: boolean;
  };
}
