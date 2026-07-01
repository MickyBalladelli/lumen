#ifndef LUMEN_PORTABLE_CRYPTO_H
#define LUMEN_PORTABLE_CRYPTO_H

#include <errno.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/types.h>

#ifdef __linux__
#include <sys/random.h>
#endif

typedef struct {
  uint32_t state[8];
  uint64_t bit_length;
  unsigned char data[64];
  size_t data_length;
} LumenSha256;

static const uint32_t lumen_sha256_constants[64] = {
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

static uint32_t lumen_rotate_right(uint32_t value, uint32_t amount) {
  return (value >> amount) | (value << (32 - amount));
}

static void lumen_sha256_transform(LumenSha256 *context, const unsigned char data[64]) {
  uint32_t words[64];
  for (size_t index = 0; index < 16; index += 1) {
    words[index] =
      ((uint32_t)data[index * 4] << 24) |
      ((uint32_t)data[index * 4 + 1] << 16) |
      ((uint32_t)data[index * 4 + 2] << 8) |
      data[index * 4 + 3];
  }
  for (size_t index = 16; index < 64; index += 1) {
    uint32_t first = lumen_rotate_right(words[index - 15], 7) ^
      lumen_rotate_right(words[index - 15], 18) ^
      (words[index - 15] >> 3);
    uint32_t second = lumen_rotate_right(words[index - 2], 17) ^
      lumen_rotate_right(words[index - 2], 19) ^
      (words[index - 2] >> 10);
    words[index] = words[index - 16] + first + words[index - 7] + second;
  }

  uint32_t a = context->state[0];
  uint32_t b = context->state[1];
  uint32_t c = context->state[2];
  uint32_t d = context->state[3];
  uint32_t e = context->state[4];
  uint32_t f = context->state[5];
  uint32_t g = context->state[6];
  uint32_t h = context->state[7];

  for (size_t index = 0; index < 64; index += 1) {
    uint32_t sigma_one = lumen_rotate_right(e, 6) ^
      lumen_rotate_right(e, 11) ^
      lumen_rotate_right(e, 25);
    uint32_t choice = (e & f) ^ ((~e) & g);
    uint32_t first = h + sigma_one + choice + lumen_sha256_constants[index] + words[index];
    uint32_t sigma_zero = lumen_rotate_right(a, 2) ^
      lumen_rotate_right(a, 13) ^
      lumen_rotate_right(a, 22);
    uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
    uint32_t second = sigma_zero + majority;

    h = g;
    g = f;
    f = e;
    e = d + first;
    d = c;
    c = b;
    b = a;
    a = first + second;
  }

  context->state[0] += a;
  context->state[1] += b;
  context->state[2] += c;
  context->state[3] += d;
  context->state[4] += e;
  context->state[5] += f;
  context->state[6] += g;
  context->state[7] += h;
}

static void lumen_sha256_init(LumenSha256 *context) {
  context->data_length = 0;
  context->bit_length = 0;
  context->state[0] = 0x6a09e667;
  context->state[1] = 0xbb67ae85;
  context->state[2] = 0x3c6ef372;
  context->state[3] = 0xa54ff53a;
  context->state[4] = 0x510e527f;
  context->state[5] = 0x9b05688c;
  context->state[6] = 0x1f83d9ab;
  context->state[7] = 0x5be0cd19;
}

static void lumen_sha256_update(LumenSha256 *context, const void *raw_data, size_t length) {
  const unsigned char *data = raw_data;
  for (size_t index = 0; index < length; index += 1) {
    context->data[context->data_length++] = data[index];
    if (context->data_length == 64) {
      lumen_sha256_transform(context, context->data);
      context->bit_length += 512;
      context->data_length = 0;
    }
  }
}

static void lumen_sha256_final(LumenSha256 *context, unsigned char digest[32]) {
  size_t index = context->data_length;
  context->data[index++] = 0x80;
  if (index > 56) {
    while (index < 64) context->data[index++] = 0;
    lumen_sha256_transform(context, context->data);
    index = 0;
  }
  while (index < 56) context->data[index++] = 0;

  context->bit_length += context->data_length * 8;
  for (size_t byte = 0; byte < 8; byte += 1) {
    context->data[63 - byte] = (unsigned char)(context->bit_length >> (byte * 8));
  }
  lumen_sha256_transform(context, context->data);

  for (size_t word = 0; word < 8; word += 1) {
    digest[word * 4] = (unsigned char)(context->state[word] >> 24);
    digest[word * 4 + 1] = (unsigned char)(context->state[word] >> 16);
    digest[word * 4 + 2] = (unsigned char)(context->state[word] >> 8);
    digest[word * 4 + 3] = (unsigned char)context->state[word];
  }
}

static void lumen_hmac_sha256_parts(
  const unsigned char *key,
  size_t key_length,
  const unsigned char **parts,
  const size_t *lengths,
  size_t part_count,
  unsigned char digest[32]
) {
  unsigned char key_block[64] = {0};
  if (key_length > sizeof(key_block)) {
    LumenSha256 hash;
    lumen_sha256_init(&hash);
    lumen_sha256_update(&hash, key, key_length);
    lumen_sha256_final(&hash, key_block);
  } else {
    memcpy(key_block, key, key_length);
  }

  unsigned char inner_pad[64];
  unsigned char outer_pad[64];
  for (size_t index = 0; index < 64; index += 1) {
    inner_pad[index] = key_block[index] ^ 0x36;
    outer_pad[index] = key_block[index] ^ 0x5c;
  }

  unsigned char inner_digest[32];
  LumenSha256 hash;
  lumen_sha256_init(&hash);
  lumen_sha256_update(&hash, inner_pad, sizeof(inner_pad));
  for (size_t index = 0; index < part_count; index += 1) {
    lumen_sha256_update(&hash, parts[index], lengths[index]);
  }
  lumen_sha256_final(&hash, inner_digest);

  lumen_sha256_init(&hash);
  lumen_sha256_update(&hash, outer_pad, sizeof(outer_pad));
  lumen_sha256_update(&hash, inner_digest, sizeof(inner_digest));
  lumen_sha256_final(&hash, digest);
}

static void lumen_hmac_sha256(
  const unsigned char *key,
  size_t key_length,
  const unsigned char *data,
  size_t length,
  unsigned char digest[32]
) {
  const unsigned char *parts[] = {data};
  const size_t lengths[] = {length};
  lumen_hmac_sha256_parts(key, key_length, parts, lengths, 1, digest);
}

static int lumen_pbkdf2_sha256(
  const char *password,
  const unsigned char *salt,
  size_t salt_length,
  uint32_t iterations,
  unsigned char *output,
  size_t output_length
) {
  if (!password || !salt || !output || iterations == 0) return 0;
  const unsigned char *key = (const unsigned char *)password;
  size_t key_length = strlen(password);
  size_t blocks = (output_length + 31) / 32;

  for (size_t block = 1; block <= blocks; block += 1) {
    unsigned char counter[4] = {
      (unsigned char)(block >> 24),
      (unsigned char)(block >> 16),
      (unsigned char)(block >> 8),
      (unsigned char)block
    };
    const unsigned char *parts[] = {salt, counter};
    const size_t lengths[] = {salt_length, sizeof(counter)};
    unsigned char value[32];
    unsigned char accumulated[32];
    lumen_hmac_sha256_parts(key, key_length, parts, lengths, 2, value);
    memcpy(accumulated, value, sizeof(accumulated));

    for (uint32_t iteration = 1; iteration < iterations; iteration += 1) {
      lumen_hmac_sha256(key, key_length, value, sizeof(value), value);
      for (size_t index = 0; index < sizeof(accumulated); index += 1) {
        accumulated[index] ^= value[index];
      }
    }

    size_t offset = (block - 1) * 32;
    size_t count = output_length - offset < 32 ? output_length - offset : 32;
    memcpy(output + offset, accumulated, count);
  }
  return 1;
}

static const unsigned char lumen_aes_sbox[256] = {
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
};

static unsigned char lumen_aes_xtime(unsigned char value) {
  return (unsigned char)((value << 1) ^ ((value >> 7) * 0x1b));
}

static void lumen_aes_key_expand(const unsigned char key[32], unsigned char round_key[240]) {
  static const unsigned char round_constants[15] = {
    0x00,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36,0x6c,0xd8,0xab,0x4d
  };
  memcpy(round_key, key, 32);
  size_t generated = 32;
  size_t round = 1;
  unsigned char temporary[4];

  while (generated < 240) {
    memcpy(temporary, round_key + generated - 4, 4);
    if (generated % 32 == 0) {
      unsigned char first = temporary[0];
      temporary[0] = lumen_aes_sbox[temporary[1]] ^ round_constants[round++];
      temporary[1] = lumen_aes_sbox[temporary[2]];
      temporary[2] = lumen_aes_sbox[temporary[3]];
      temporary[3] = lumen_aes_sbox[first];
    } else if (generated % 32 == 16) {
      for (size_t index = 0; index < 4; index += 1) {
        temporary[index] = lumen_aes_sbox[temporary[index]];
      }
    }
    for (size_t index = 0; index < 4; index += 1) {
      round_key[generated] = round_key[generated - 32] ^ temporary[index];
      generated += 1;
    }
  }
}

static void lumen_aes_add_round_key(unsigned char state[16], const unsigned char *round_key) {
  for (size_t index = 0; index < 16; index += 1) state[index] ^= round_key[index];
}

static void lumen_aes_sub_bytes(unsigned char state[16]) {
  for (size_t index = 0; index < 16; index += 1) state[index] = lumen_aes_sbox[state[index]];
}

static void lumen_aes_shift_rows(unsigned char state[16]) {
  unsigned char copy[16];
  memcpy(copy, state, sizeof(copy));
  state[0]=copy[0]; state[1]=copy[5]; state[2]=copy[10]; state[3]=copy[15];
  state[4]=copy[4]; state[5]=copy[9]; state[6]=copy[14]; state[7]=copy[3];
  state[8]=copy[8]; state[9]=copy[13]; state[10]=copy[2]; state[11]=copy[7];
  state[12]=copy[12]; state[13]=copy[1]; state[14]=copy[6]; state[15]=copy[11];
}

static void lumen_aes_mix_columns(unsigned char state[16]) {
  for (size_t column = 0; column < 4; column += 1) {
    unsigned char *values = state + column * 4;
    unsigned char total = values[0] ^ values[1] ^ values[2] ^ values[3];
    unsigned char first = values[0];
    values[0] ^= total ^ lumen_aes_xtime(values[0] ^ values[1]);
    values[1] ^= total ^ lumen_aes_xtime(values[1] ^ values[2]);
    values[2] ^= total ^ lumen_aes_xtime(values[2] ^ values[3]);
    values[3] ^= total ^ lumen_aes_xtime(values[3] ^ first);
  }
}

static void lumen_aes_encrypt_block(unsigned char block[16], const unsigned char round_key[240]) {
  lumen_aes_add_round_key(block, round_key);
  for (size_t round = 1; round < 14; round += 1) {
    lumen_aes_sub_bytes(block);
    lumen_aes_shift_rows(block);
    lumen_aes_mix_columns(block);
    lumen_aes_add_round_key(block, round_key + round * 16);
  }
  lumen_aes_sub_bytes(block);
  lumen_aes_shift_rows(block);
  lumen_aes_add_round_key(block, round_key + 224);
}

static int lumen_aes256_ctr(
  const unsigned char *input,
  size_t length,
  const unsigned char key[32],
  const unsigned char iv[16],
  unsigned char *output
) {
  unsigned char round_key[240];
  unsigned char counter[16];
  lumen_aes_key_expand(key, round_key);
  memcpy(counter, iv, sizeof(counter));

  for (size_t offset = 0; offset < length; offset += 16) {
    unsigned char stream[16];
    memcpy(stream, counter, sizeof(stream));
    lumen_aes_encrypt_block(stream, round_key);
    size_t count = length - offset < 16 ? length - offset : 16;
    for (size_t index = 0; index < count; index += 1) {
      output[offset + index] = input[offset + index] ^ stream[index];
    }
    for (int index = 15; index >= 0; index -= 1) {
      counter[index] += 1;
      if (counter[index] != 0) break;
    }
  }
  return 1;
}

static int lumen_secure_random(void *buffer, size_t length) {
  unsigned char *output = buffer;
  size_t offset = 0;
#ifdef __linux__
  while (offset < length) {
    ssize_t count = getrandom(output + offset, length - offset, 0);
    if (count > 0) {
      offset += (size_t)count;
      continue;
    }
    if (count < 0 && errno == EINTR) continue;
    break;
  }
  if (offset == length) return 1;
#endif

  FILE *random = fopen("/dev/urandom", "rb");
  if (!random) return 0;
  offset = fread(output, 1, length, random);
  fclose(random);
  return offset == length;
}

static int lumen_constant_time_equal(
  const unsigned char *left,
  const unsigned char *right,
  size_t length
) {
  unsigned char difference = 0;
  for (size_t index = 0; index < length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference == 0;
}

#endif
