#include <stdint.h>

static uint64_t fuzz_state = 0x4c756d656eULL;

static uint32_t fuzz_random(void) {
  fuzz_state ^= fuzz_state << 13;
  fuzz_state ^= fuzz_state >> 7;
  fuzz_state ^= fuzz_state << 17;
  return (uint32_t)fuzz_state;
}

int main(int argc, char **argv) {
  size_t runs = argc > 1 ? (size_t)strtoull(argv[1], NULL, 10) : 10000;
  size_t max_length = argc > 2 ? (size_t)strtoull(argv[2], NULL, 10) : 16384;
  if (max_length == 0) return 1;

  static const unsigned char seed[] =
    "POST /socket.io/emit HTTP/1.1\r\n"
    "Host: localhost\r\n"
    "Content-Length: 11\r\n"
    "\r\n"
    "{\"ok\":true}";
  unsigned char *input = malloc(max_length);
  if (!input) return 1;

  for (size_t run = 0; run < runs; run += 1) {
    size_t length = sizeof(seed) - 1;
    if (length > max_length) length = max_length;
    memcpy(input, seed, length);

    size_t changes = 1 + fuzz_random() % 32;
    for (size_t change = 0; change < changes; change += 1) {
      if (length > 0 && (fuzz_random() & 3) != 0) {
        input[fuzz_random() % length] = (unsigned char)fuzz_random();
      } else if (length < max_length) {
        input[length++] = (unsigned char)fuzz_random();
      }
    }
    if (length > 0 && (fuzz_random() & 7) == 0) length = fuzz_random() % length;
    LLVMFuzzerTestOneInput(input, length);
  }

  free(input);
  return 0;
}
