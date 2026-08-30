
const dgStorageWarningState = {
  warned: false,
};

function dgWarnStorageFailure(operation, key, error) {
  if (dgStorageWarningState.warned) return;
  dgStorageWarningState.warned = true;
  console.warn(
    `[Daily Genre] Browser storage is unavailable. The app will continue, but some preferences may not persist. First failure: ${operation} "${String(key || "")}".`,
    error,
  );
}

function dgResolveStorage(storageType = "local") {
  return storageType === "session"
    ? window.sessionStorage
    : window.localStorage;
}

function safeStorageGet(key, fallback = null, storageType = "local") {
  try {
    const value = dgResolveStorage(storageType).getItem(key);
    return value === null ? fallback : value;
  } catch (error) {
    dgWarnStorageFailure("read", key, error);
    return fallback;
  }
}

function safeStorageSet(key, value, storageType = "local") {
  try {
    dgResolveStorage(storageType).setItem(key, value);
    return true;
  } catch (error) {
    dgWarnStorageFailure("write", key, error);
    return false;
  }
}

function safeStorageRemove(key, storageType = "local") {
  try {
    dgResolveStorage(storageType).removeItem(key);
    return true;
  } catch (error) {
    dgWarnStorageFailure("remove", key, error);
    return false;
  }
}

function safeSessionStorageGet(key, fallback = null) {
  return safeStorageGet(key, fallback, "session");
}

function safeSessionStorageSet(key, value) {
  return safeStorageSet(key, value, "session");
}

function safeSessionStorageRemove(key) {
  return safeStorageRemove(key, "session");
}


function isDailyGenreMobilePerfMode() {
  try {
    return Boolean(
      window.__dgForceMobilePerf ||
      (window.matchMedia &&
        window.matchMedia("(max-width: 760px)").matches) ||
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "")
    );
  } catch (_) {
    return false;
  }
}

window.isDailyGenreMobilePerfMode = isDailyGenreMobilePerfMode;

function escapeHtml(value='') {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

function normalizeName(s='') {
      return String(s)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

function categoryLine(genre) {
  return genre.category_path || genre.categorypath || genre.subcategory || 'Uncategorized';
}

function dateValue(genre) {
    return genre.date_normalized || genre.datenormalized || '';
    }

function normalizedGenreStatus(genre) {
    return String(genre?.status || '').trim().toLowerCase();
    }

function isGenreZanger(genre) {
      const status = normalizedGenreStatus(genre);
      const rating = String(genre?.rating || '').trim().toLowerCase();
      return status === 'veto' || status === 'zanger' || rating === 'zanger';
    }