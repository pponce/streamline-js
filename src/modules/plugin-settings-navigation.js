export function pluginSettingsUrl(apiBase, pluginId, returnTo, steamHeaterTemperature) {
    const url = new URL(`${apiBase}/plugins/${encodeURIComponent(pluginId)}/ui`);
    url.searchParams.set('returnTo', returnTo);
    if (Number.isInteger(steamHeaterTemperature) && steamHeaterTemperature >= 135 && steamHeaterTemperature <= 165) {
        url.searchParams.set('steamHeaterTemperature', steamHeaterTemperature);
    }
    return url.href;
}
