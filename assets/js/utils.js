
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

// Shared post-render hook registry -- Phase 3 of the architectural redesign.
// Several patch files used to monkey-patch a base function (capture
// window.someFunction, reassign it to a wrapper that calls the original then
// does its own thing) to run code after that function finishes. That makes
// load order load-bearing and every wrap adds another fragile layer. This
// registry replaces that: a base function calls dgRunPostHooks('name', ...)
// once at its own natural end, and any file that wants to react just calls
// dgRegisterPostHook('name', fn) instead of wrapping anything. Hooks run in
// registration order and a throwing hook can't break the base function or
// any other hook.
const dgPostRenderHooks = Object.create(null);

function dgRegisterPostHook(name, fn) {
  if (typeof fn !== 'function') return;
  if (!dgPostRenderHooks[name]) dgPostRenderHooks[name] = [];
  dgPostRenderHooks[name].push(fn);
}

function dgRunPostHooks(name, ...args) {
  const hooks = dgPostRenderHooks[name];
  if (!hooks || !hooks.length) return;
  for (const hook of hooks) {
    try { hook(...args); } catch (err) {
      console.error(`[Daily Genre] Post-render hook for "${name}" failed`, err);
    }
  }
}

window.dgRegisterPostHook = dgRegisterPostHook;
window.dgRunPostHooks = dgRunPostHooks;

// Shared modal accessibility helper: traps Tab focus inside the modal,
// closes on Escape, and restores focus to whatever triggered the modal
// once it closes. Reused by the password-save modal and the Spotify
// playlist modal rather than duplicating this logic in each.
const DG_MODAL_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function dgOpenModalA11y(modalRootEl, onEscape) {
  if (!modalRootEl) return () => {};
  const previouslyFocused = document.activeElement;

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(
      modalRootEl.querySelectorAll(DG_MODAL_FOCUSABLE_SELECTOR)
    ).filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', handleKeydown);

  return function closeModalA11y() {
    document.removeEventListener('keydown', handleKeydown);
    try {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    } catch (_) {}
  };
}

window.dgOpenModalA11y = dgOpenModalA11y;