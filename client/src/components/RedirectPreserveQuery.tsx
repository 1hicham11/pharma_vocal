import { Navigate, useLocation } from 'react-router-dom';

/** Redirige vers un chemin SPA en conservant ?query et #hash. */
export function RedirectPreserveQuery({ to }: { to: string }) {
    const loc = useLocation();
    return <Navigate to={`${to}${loc.search}${loc.hash}`} replace />;
}
