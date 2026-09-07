.pragma library

function arraysEqual(left, right) {
    const a = Array.from(left ?? []);
    const b = Array.from(right ?? []);
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; ++i) {
        if (String(a[i]) !== String(b[i])) {
            return false;
        }
    }
    return true;
}

function normalizeFavorite(rawValue) {
    let value = String(rawValue ?? "").trim();
    if (value.length === 0) {
        return "";
    }

    if (value.startsWith("applications:")) {
        value = value.slice("applications:".length).split("?")[0];
        while (value.startsWith("/")) {
            value = value.slice(1);
        }
        try {
            value = decodeURIComponent(value);
        } catch (error) {
            // Keep malformed input unchanged so it remains removable.
        }
        return value;
    }

    if (value.startsWith("file:")) {
        try {
            value = String(Qt.resolvedUrl(value));
        } catch (error) {
            // Continue with the original URL when it cannot be resolved.
        }

        let localPath = value.slice("file:".length);
        try {
            localPath = decodeURIComponent(localPath);
        } catch (error) {
            // Keep malformed input unchanged so it remains removable.
        }

        const applicationsMarker = "/applications/";
        const markerIndex = localPath.lastIndexOf(applicationsMarker);
        if (markerIndex >= 0 && localPath.endsWith(".desktop")) {
            const relativePath = localPath.slice(
                markerIndex + applicationsMarker.length);
            return relativePath.split("/").join("-");
        }
    }

    return value;
}

function canonicalFavorites(values) {
    const result = [];
    for (const rawValue of values ?? []) {
        const favoriteId = normalizeFavorite(rawValue);
        if (favoriteId.length > 0 && !result.includes(favoriteId)) {
            result.push(favoriteId);
        }
    }
    return result;
}

function containsFavorite(values, rawValue) {
    const favoriteId = normalizeFavorite(rawValue);
    return favoriteId.length > 0
        && canonicalFavorites(values).includes(favoriteId);
}
