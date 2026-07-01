#include "../../src/runtime/system.c"
#include "../../src/runtime/http.c"

int LLVMFuzzerTestOneInput(const unsigned char *data, size_t size) {
  if (size < 4 || size > LUMEN_HTTP_MAX_HEADERS) return 0;

  LumenHttpRequest request;
  size_t content_length = 0;
  parse_http_request_head(data, size, &request, &content_length);
  return 0;
}

#ifdef LUMEN_STANDALONE_FUZZ
#include "standalone.h"
#endif
