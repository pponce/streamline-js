export function pluginSettingsUrl(apiBase, pluginId, returnTo) {
    const url = new URL(`${apiBase}/plugins/${encodeURIComponent(pluginId)}/ui`);
    url.searchParams.set('returnTo', returnTo);
    return url.href;
}
