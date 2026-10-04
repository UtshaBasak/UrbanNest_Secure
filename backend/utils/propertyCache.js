/**
 * Short-lived cache of decrypted property listings.
 *
 * Listing pages need every active property decrypted in memory (fields are
 * RSA-encrypted, so the database cannot filter or search them) and the
 * documents carry base64 images, so each uncached request re-downloads and
 * re-decrypts the whole collection. Entries expire after a few seconds and
 * are cleared whenever a property or its availability changes.
 */
const TTL_MS = 30 * 1000;
const cache = new Map();

export async function getCachedList(key, load) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  // Share one in-flight load between concurrent requests
  const value = (hit?.pending) || load();
  cache.set(key, { pending: value, expires: 0 });
  try {
    const result = await value;
    cache.set(key, { value: result, expires: Date.now() + TTL_MS });
    return result;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

export function invalidatePropertyCache() {
  cache.clear();
}
