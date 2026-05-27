// UTF-8 safe base64 helpers. btoa/atob only handle latin-1; running them on
// strings containing multi-byte characters throws, so we round-trip through
// TextEncoder/TextDecoder. Fallbacks preserve old behavior for pure-ASCII input.

export function base64Encode(str) {
  try {
    const bytes = new TextEncoder().encode(str);
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    return btoa(binaryString);
  } catch (error) {
    try {
      return btoa(str);
    } catch (fallbackError) {
      throw new Error(`Base64 encoding failed: ${fallbackError.message}`);
    }
  }
}

export function base64Decode(str) {
  try {
    const binaryString = atob(str);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (error) {
    try {
      return atob(str);
    } catch (fallbackError) {
      throw new Error(`Base64 decoding failed: ${fallbackError.message}`);
    }
  }
}
