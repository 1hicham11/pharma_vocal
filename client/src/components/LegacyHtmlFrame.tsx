import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const legacyBase = (import.meta.env.VITE_LEGACY_STATIC_ORIGIN as string | undefined)?.replace(/\/$/, '') ?? '';

type Props = {
    /** Fichier à la racine de public, ex. session.html */
    file: string;
    title?: string;
};

/**
 * Affiche une page HTML historique telle quelle (iframe).
 * Par défaut : chemin relatif (même origine → localStorage / cookies partagés en dev Vite + publicDir).
 * Optionnel : VITE_LEGACY_STATIC_ORIGIN si le front est servi ailleurs que les .html.
 */
export function LegacyHtmlFrame({ file, title = 'Voxeleon' }: Props) {
    const location = useLocation();
    const rel = `/${file}${location.search}`;
    const src = legacyBase ? `${legacyBase}/${file}${location.search}` : rel;
    const [isLoaded, setIsLoaded] = useState(false);
    const isDarkTheme =
        typeof window !== 'undefined' && (() => {
            try {
                return localStorage.getItem('site_theme') !== 'light';
            } catch (_) {
                return true;
            }
        })();

    useEffect(() => {
        setIsLoaded(false);
    }, [src]);

    return (
        <div
            className="fixed inset-0"
            style={{
                backgroundColor: isDarkTheme ? '#08101d' : '#ffffff',
                colorScheme: isDarkTheme ? 'dark' : 'light',
            }}
        >
            <iframe
                title={title}
                className="absolute inset-0 h-[100dvh] w-full border-0 block transition-opacity duration-75"
                style={{
                    opacity: isLoaded ? 1 : 0,
                    backgroundColor: isDarkTheme ? '#08101d' : '#ffffff',
                    colorScheme: isDarkTheme ? 'dark' : 'light',
                }}
                src={src}
                onLoad={() => setIsLoaded(true)}
            />
        </div>
    );
}
