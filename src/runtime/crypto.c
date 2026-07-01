#include "runtime_internal.h"
#include "lumen_crypto.h"
#if defined(__APPLE__) && !defined(LUMEN_FORCE_PORTABLE_CRYPTO)
#define LUMEN_USE_COMMON_CRYPTO 1
#include <CommonCrypto/CommonCryptor.h>
#include <CommonCrypto/CommonDigest.h>
#include <CommonCrypto/CommonHMAC.h>
#include <CommonCrypto/CommonKeyDerivation.h>
#include <CommonCrypto/CommonRandom.h>
#else
#include "portable_crypto.h"
#define CC_SHA256_DIGEST_LENGTH 32
typedef int CCOperation;
#define kCCEncrypt 0
#define kCCDecrypt 1
#endif

static const char lumen_base64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static char *lumen_base64_encode(const unsigned char *data, size_t length) {
  size_t output_length = 4 * ((length + 2) / 3);
  char *out = malloc(output_length + 1);
  if (!out) return NULL;

  size_t input_index = 0;
  size_t output_index = 0;

  while (input_index < length) {
    unsigned int octet_a = input_index < length ? data[input_index++] : 0;
    unsigned int octet_b = input_index < length ? data[input_index++] : 0;
    unsigned int octet_c = input_index < length ? data[input_index++] : 0;
    unsigned int triple = (octet_a << 16) | (octet_b << 8) | octet_c;

    out[output_index++] = lumen_base64_table[(triple >> 18) & 0x3F];
    out[output_index++] = lumen_base64_table[(triple >> 12) & 0x3F];
    out[output_index++] = lumen_base64_table[(triple >> 6) & 0x3F];
    out[output_index++] = lumen_base64_table[triple & 0x3F];
  }

  if (length % 3 == 1) {
    out[output_length - 2] = '=';
    out[output_length - 1] = '=';
  } else if (length % 3 == 2) {
    out[output_length - 1] = '=';
  }

  out[output_length] = '\0';
  return out;
}

static int lumen_base64_value(char value) {
  if (value >= 'A' && value <= 'Z') return value - 'A';
  if (value >= 'a' && value <= 'z') return value - 'a' + 26;
  if (value >= '0' && value <= '9') return value - '0' + 52;
  if (value == '+') return 62;
  if (value == '/') return 63;
  return -1;
}

static unsigned char *lumen_base64_decode(const char *input, size_t *output_length) {
  size_t length = strlen(input);
  if (length % 4 != 0) return NULL;

  size_t padding = 0;
  if (length > 0 && input[length - 1] == '=') padding += 1;
  if (length > 1 && input[length - 2] == '=') padding += 1;

  *output_length = (length / 4) * 3 - padding;
  unsigned char *out = malloc(*output_length + 1);
  if (!out) return NULL;

  size_t input_index = 0;
  size_t output_index = 0;

  while (input_index < length) {
    int sextet_a = input[input_index] == '=' ? 0 : lumen_base64_value(input[input_index]);
    input_index += 1;
    int sextet_b = input[input_index] == '=' ? 0 : lumen_base64_value(input[input_index]);
    input_index += 1;
    int sextet_c = input[input_index] == '=' ? 0 : lumen_base64_value(input[input_index]);
    input_index += 1;
    int sextet_d = input[input_index] == '=' ? 0 : lumen_base64_value(input[input_index]);
    input_index += 1;

    if (sextet_a < 0 || sextet_b < 0 || sextet_c < 0 || sextet_d < 0) {
      free(out);
      return NULL;
    }

    unsigned int triple = ((unsigned int)sextet_a << 18) |
      ((unsigned int)sextet_b << 12) |
      ((unsigned int)sextet_c << 6) |
      (unsigned int)sextet_d;

    if (output_index < *output_length) out[output_index++] = (triple >> 16) & 0xFF;
    if (output_index < *output_length) out[output_index++] = (triple >> 8) & 0xFF;
    if (output_index < *output_length) out[output_index++] = triple & 0xFF;
  }

  out[*output_length] = '\0';
  return out;
}

static int lumen_protocol_is_aes256(const char *protocol) {
  return strcmp(protocol, "AES-256") == 0 ||
    strcmp(protocol, "AES-256-CTR-HMAC-SHA256") == 0;
}

static int lumen_derive_crypto_keys(const char *password, const unsigned char *salt, unsigned char *keys) {
#ifdef LUMEN_USE_COMMON_CRYPTO
  return CCKeyDerivationPBKDF(
    kCCPBKDF2,
    password,
    strlen(password),
    salt,
    16,
    kCCPRFHmacAlgSHA256,
    100000,
    keys,
    64
  ) == kCCSuccess;
#else
  return lumen_pbkdf2_sha256(password, salt, 16, 100000, keys, 64);
#endif
}

static int lumen_aes_ctr_crypt(const unsigned char *input, size_t length, const unsigned char *key, const unsigned char *iv, unsigned char *output, CCOperation operation) {
#ifdef LUMEN_USE_COMMON_CRYPTO
  CCCryptorRef cryptor = NULL;
  CCCryptorStatus status = CCCryptorCreateWithMode(
    operation,
    kCCModeCTR,
    kCCAlgorithmAES,
    ccNoPadding,
    iv,
    key,
    32,
    NULL,
    0,
    0,
    0,
    &cryptor
  );

  if (status != kCCSuccess) return 0;

  size_t moved = 0;
  status = CCCryptorUpdate(cryptor, input, length, output, length, &moved);
  CCCryptorRelease(cryptor);

  return status == kCCSuccess && moved == length;
#else
  (void)operation;
  return lumen_aes256_ctr(input, length, key, iv, output);
#endif
}

static void lumen_crypto_tag(const unsigned char *key, const unsigned char *salt, const unsigned char *iv, const unsigned char *cipher, size_t cipher_length, unsigned char *tag) {
#ifdef LUMEN_USE_COMMON_CRYPTO
  CCHmacContext context;
  CCHmacInit(&context, kCCHmacAlgSHA256, key, 32);
  CCHmacUpdate(&context, salt, 16);
  CCHmacUpdate(&context, iv, 16);
  CCHmacUpdate(&context, cipher, cipher_length);
  CCHmacFinal(&context, tag);
#else
  const unsigned char *parts[] = {salt, iv, cipher};
  const size_t lengths[] = {16, 16, cipher_length};
  lumen_hmac_sha256_parts(key, 32, parts, lengths, 3, tag);
#endif
}

char *lumen_encrypt(const char *value, const char *password, const char *protocol) {
  if (!lumen_protocol_is_aes256(protocol)) return "";

  unsigned char salt[16];
  unsigned char iv[16];
  unsigned char keys[64];

#ifdef LUMEN_USE_COMMON_CRYPTO
  if (CCRandomGenerateBytes(salt, sizeof(salt)) != kCCSuccess) return "";
  if (CCRandomGenerateBytes(iv, sizeof(iv)) != kCCSuccess) return "";
#else
  if (!lumen_secure_random(salt, sizeof(salt))) {
    return "error: secure random provider unavailable";
  }
  if (!lumen_secure_random(iv, sizeof(iv))) {
    return "error: secure random provider unavailable";
  }
#endif
  if (!lumen_derive_crypto_keys(password, salt, keys)) return "";

  size_t value_length = strlen(value);
  unsigned char *cipher = malloc(value_length + 1);
  if (!cipher) return "";

  if (!lumen_aes_ctr_crypt((const unsigned char *)value, value_length, keys, iv, cipher, kCCEncrypt)) {
    free(cipher);
    return "";
  }

  unsigned char tag[CC_SHA256_DIGEST_LENGTH];
  lumen_crypto_tag(keys + 32, salt, iv, cipher, value_length, tag);

  char *salt_text = lumen_base64_encode(salt, sizeof(salt));
  char *iv_text = lumen_base64_encode(iv, sizeof(iv));
  char *cipher_text = lumen_base64_encode(cipher, value_length);
  char *tag_text = lumen_base64_encode(tag, sizeof(tag));

  if (!salt_text || !iv_text || !cipher_text || !tag_text) {
    free(cipher);
    free(salt_text);
    free(iv_text);
    free(cipher_text);
    free(tag_text);
    return "";
  }

  size_t output_length = strlen("lumen:v1:AES-256-CTR-HMAC-SHA256::::") +
    strlen(salt_text) +
    strlen(iv_text) +
    strlen(cipher_text) +
    strlen(tag_text);

  char *out = malloc(output_length + 1);
  if (!out) {
    free(cipher);
    return "";
  }

  snprintf(
    out,
    output_length + 1,
    "lumen:v1:AES-256-CTR-HMAC-SHA256:%s:%s:%s:%s",
    salt_text,
    iv_text,
    cipher_text,
    tag_text
  );

  free(cipher);
  free(salt_text);
  free(iv_text);
  free(cipher_text);
  free(tag_text);
  return out;
}

char *lumen_decrypt(const char *value, const char *password, const char *protocol) {
  if (!lumen_protocol_is_aes256(protocol)) return "";

  char *copy = lumen_strdup(value);
  if (!copy) return "";

  char *parts[7];
  int count = 0;
  char *cursor = copy;

  while (count < 7) {
    parts[count++] = cursor;
    char *next = strchr(cursor, ':');
    if (!next) break;
    *next = '\0';
    cursor = next + 1;
  }

  if (count != 7 ||
    strcmp(parts[0], "lumen") != 0 ||
    strcmp(parts[1], "v1") != 0 ||
    strcmp(parts[2], "AES-256-CTR-HMAC-SHA256") != 0) {
    free(copy);
    return "";
  }

  size_t salt_length = 0;
  size_t iv_length = 0;
  size_t cipher_length = 0;
  size_t tag_length = 0;
  unsigned char *salt = lumen_base64_decode(parts[3], &salt_length);
  unsigned char *iv = lumen_base64_decode(parts[4], &iv_length);
  unsigned char *cipher = lumen_base64_decode(parts[5], &cipher_length);
  unsigned char *tag = lumen_base64_decode(parts[6], &tag_length);

  if (!salt || !iv || !cipher || !tag || salt_length != 16 || iv_length != 16 || tag_length != CC_SHA256_DIGEST_LENGTH) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    return "";
  }

  unsigned char keys[64];
  unsigned char expected_tag[CC_SHA256_DIGEST_LENGTH];
  if (!lumen_derive_crypto_keys(password, salt, keys)) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    return "";
  }

  lumen_crypto_tag(keys + 32, salt, iv, cipher, cipher_length, expected_tag);
#ifdef LUMEN_USE_COMMON_CRYPTO
  int valid_tag = memcmp(tag, expected_tag, CC_SHA256_DIGEST_LENGTH) == 0;
#else
  int valid_tag = lumen_constant_time_equal(tag, expected_tag, CC_SHA256_DIGEST_LENGTH);
#endif
  if (!valid_tag) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    return "";
  }

  unsigned char *plain = malloc(cipher_length + 1);
  if (!plain) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    return "";
  }

  if (!lumen_aes_ctr_crypt(cipher, cipher_length, keys, iv, plain, kCCDecrypt)) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    free(plain);
    return "";
  }

  plain[cipher_length] = '\0';
  free(copy);
  free(salt);
  free(iv);
  free(cipher);
  free(tag);
  return (char *)plain;
}
