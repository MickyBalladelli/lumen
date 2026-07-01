#include "../../src/runtime/system.c"
#include "../../src/runtime/http.c"

int LLVMFuzzerTestOneInput(const unsigned char *data, size_t size) {
  LumenWebSocketFrame frame;
  parse_websocket_frame_header(data, size, &frame);
  return 0;
}

#ifdef LUMEN_STANDALONE_FUZZ
#include "standalone.h"
#endif
