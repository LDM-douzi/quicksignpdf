const DB_NAME = "freepdf-nobullshit-editor";
const STORE_NAME = "sessions";
const ACTIVE_SESSION_ID = "active-session";
const AUTOSAVE_PREFERENCE_KEY = "freepdf-nobullshit-autosave-enabled";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, handler) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);

        let settled = false;

        const finish = (callback) => (event) => {
          if (settled) {
            return;
          }
          settled = true;
          callback(event);
        };

        transaction.oncomplete = finish(() => {
          db.close();
          resolve();
        });
        transaction.onerror = finish(() => {
          db.close();
          reject(transaction.error);
        });
        transaction.onabort = finish(() => {
          db.close();
          reject(transaction.error);
        });

        handler(store, resolve, reject, db);
      }),
  );
}

export function saveActiveSession(session) {
  return withStore("readwrite", (store) => {
    store.put({
      id: ACTIVE_SESSION_ID,
      updatedAt: new Date().toISOString(),
      ...session,
    });
  });
}

export function loadActiveSession() {
  return withStore("readonly", (store, resolve, reject, db) => {
    const request = store.get(ACTIVE_SESSION_ID);
    request.onsuccess = () => {
      db.close();
      resolve(request.result ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export function clearActiveSession() {
  return withStore("readwrite", (store) => {
    store.delete(ACTIVE_SESSION_ID);
  });
}

export function loadAutosavePreference() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const value = window.localStorage.getItem(AUTOSAVE_PREFERENCE_KEY);
    return value === null ? true : value === "true";
  } catch (error) {
    console.error(error);
    return true;
  }
}

export function saveAutosavePreference(enabled) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(AUTOSAVE_PREFERENCE_KEY, String(Boolean(enabled)));
  } catch (error) {
    console.error(error);
  }
}


